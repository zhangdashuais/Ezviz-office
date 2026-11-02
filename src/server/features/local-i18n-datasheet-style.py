import sys
from copy import copy
from openpyxl import load_workbook
from openpyxl.styles import PatternFill

template_path, output_path = sys.argv[1], sys.argv[2]
header_template_path = sys.argv[3] if len(sys.argv) > 3 else template_path
template_book = load_workbook(template_path)
header_template_book = load_workbook(header_template_path)
output_book = load_workbook(output_path)
header_template_sheet = header_template_book["Datasheet"]

def apply_style(source, target):
    target.font = copy(source.font)
    target.fill = copy(source.fill)
    target.border = copy(source.border)
    target.alignment = copy(source.alignment)
    target.number_format = source.number_format
    target.protection = copy(source.protection)

if "Datasheet" in output_book.sheetnames:
    template_sheet = template_book["Datasheet"]
    sheet = output_book["Datasheet"]
    for key, dimension in template_sheet.column_dimensions.items():
        sheet.column_dimensions[key].width = dimension.width
    for column in range(1, sheet.max_column + 1):
        apply_style(header_template_sheet.cell(1, min(column, header_template_sheet.max_column)), sheet.cell(1, column))
    sheet.row_dimensions[1].height = header_template_sheet.row_dimensions[1].height
    for row in range(2, sheet.max_row + 1):
        for column in range(1, sheet.max_column + 1):
            cell = sheet.cell(row, column)
            if cell.value and str(cell.value).startswith("If you have proofread"):
                cell.fill = PatternFill(fill_type="solid", fgColor="FFFF00")
            else:
                apply_style(template_sheet.cell(2, min(column, template_sheet.max_column)), cell)
    for row in range(2, sheet.max_row + 1):
        if str(sheet.cell(row, 1).value or "").startswith("If you have proofread"):
            for column in range(1, sheet.max_column + 1):
                sheet.cell(row, column).fill = PatternFill(fill_type="solid", fgColor="FFFF00")
else:
    header_style = header_template_sheet.cell(1, 2)
    for sheet in output_book.worksheets:
        for column in range(1, sheet.max_column + 1):
            apply_style(header_style, sheet.cell(1, column))
        sheet.row_dimensions[1].height = header_template_sheet.row_dimensions[1].height

output_book.save(output_path)
