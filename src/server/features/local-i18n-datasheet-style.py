import sys
from copy import copy
from openpyxl import load_workbook
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont
from openpyxl.styles import Font, PatternFill

template_path, output_path = sys.argv[1], sys.argv[2]
header_template_path = sys.argv[3] if len(sys.argv) > 3 else template_path
template_book = load_workbook(template_path)
header_template_book = load_workbook(header_template_path)
output_book = load_workbook(output_path, rich_text=True)
header_template_sheet = header_template_book["Datasheet"] if "Datasheet" in header_template_book.sheetnames else header_template_book.active

FONT_NAME = "Calibri"
FONT_SIZE = 11
HEADER_COLOR = "FFA6A6A6"
NOTE_COLOR = "FF1E293B"
PRODUCT_COLOR = "FFFF0000"


def calibri_11(font):
    styled = copy(font) if font else Font()
    styled.name = FONT_NAME
    styled.sz = FONT_SIZE
    return styled

def apply_style(source, target):
    target.font = calibri_11(source.font if source.has_style else None)
    target.fill = copy(source.fill)
    target.border = copy(source.border)
    target.alignment = copy(source.alignment)
    target.number_format = source.number_format
    target.protection = copy(source.protection)


def apply_header_style(source, target):
    apply_style(source, target)
    target.fill = PatternFill(fill_type="solid", fgColor=HEADER_COLOR)


def review_note_product(value):
    text = str(value or "")
    prefix = "If you have proofread "
    suffix = " then no need to review the following strings."
    if not text.startswith(prefix) or not text.endswith(suffix):
        return ""
    return text[len(prefix):-len(suffix)].strip()


def style_review_note(sheet, row):
    product = review_note_product(sheet.cell(row, 1).value)
    if not product:
        return
    note_font = InlineFont(rFont=FONT_NAME, sz=FONT_SIZE, color=NOTE_COLOR)
    product_font = InlineFont(rFont=FONT_NAME, sz=FONT_SIZE, color=PRODUCT_COLOR)
    sheet.cell(row, 1).value = CellRichText(
        TextBlock(note_font, "If you have proofread "),
        TextBlock(product_font, product),
        TextBlock(note_font, " then no need to review the following strings.")
    )
    if sheet.max_column >= 2:
        sheet.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)

if "Datasheet" in output_book.sheetnames:
    template_sheet = template_book["Datasheet"] if "Datasheet" in template_book.sheetnames else template_book.active
    sheet = output_book["Datasheet"]
    for key, dimension in template_sheet.column_dimensions.items():
        sheet.column_dimensions[key].width = dimension.width
    for column in range(1, sheet.max_column + 1):
        apply_header_style(header_template_sheet.cell(1, min(column, header_template_sheet.max_column)), sheet.cell(1, column))
    sheet.row_dimensions[1].height = header_template_sheet.row_dimensions[1].height or 36
    for row in range(2, sheet.max_row + 1):
        for column in range(1, sheet.max_column + 1):
            cell = sheet.cell(row, column)
            apply_style(template_sheet.cell(2, min(column, template_sheet.max_column)), cell)
            if cell.value and str(cell.value).startswith("If you have proofread"):
                cell.fill = PatternFill(fill_type="solid", fgColor="FFFF00")
    for row in range(2, sheet.max_row + 1):
        if str(sheet.cell(row, 1).value or "").startswith("If you have proofread"):
            for column in range(1, sheet.max_column + 1):
                sheet.cell(row, column).fill = PatternFill(fill_type="solid", fgColor="FFFF00")
            style_review_note(sheet, row)
    for other_sheet in output_book.worksheets:
        if other_sheet == sheet:
            continue
        for column in range(1, other_sheet.max_column + 1):
            apply_header_style(header_template_sheet.cell(1, min(column, header_template_sheet.max_column)), other_sheet.cell(1, column))
        other_sheet.row_dimensions[1].height = header_template_sheet.row_dimensions[1].height or 36
        for row in range(2, other_sheet.max_row + 1):
            for column in range(1, other_sheet.max_column + 1):
                apply_style(template_sheet.cell(2, min(column, template_sheet.max_column)), other_sheet.cell(row, column))
            if str(other_sheet.cell(row, 1).value or "").startswith("If you have proofread"):
                for column in range(1, other_sheet.max_column + 1):
                    other_sheet.cell(row, column).fill = PatternFill(fill_type="solid", fgColor="FFFF00")
                style_review_note(other_sheet, row)
else:
    header_style = header_template_sheet.cell(1, 2)
    for sheet in output_book.worksheets:
        for column in range(1, sheet.max_column + 1):
            apply_header_style(header_style, sheet.cell(1, column))
        sheet.row_dimensions[1].height = header_template_sheet.row_dimensions[1].height or 36

# Enforce the exported workbook typography even for cells outside the copied
# template area (for example formulas, blank styled cells and appended sheets).
for sheet in output_book.worksheets:
    for row in sheet.iter_rows():
        for cell in row:
            cell.font = calibri_11(cell.font)

output_book.save(output_path)
