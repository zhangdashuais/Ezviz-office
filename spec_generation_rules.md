# Specifications Excel Generation Rules

Reference template:

`D:\产品\Ezivz\C9c Dual 3K\upload\C9c Dual 3K spec.xlsx`

## Workbook Structure

- Use one worksheet named `Spec`.
- Use multi-locale column pairs.
- Each locale uses two adjacent columns:
  - odd column: field/category/item label
  - even column: value
- Row 1 is the locale header and must be merged per pair, for example `A1:B1`, `C1:D1`.
- Row 2 is the localized `Specifications` title and must also be merged per pair.
- Row 3 is `Model / model value`.

## Locale Header Rule

Row 1 must contain multiple locale/country headers following the reference file style.

Examples from the reference:

- `1_English (English-英文)`
- `2_Русский (Russian-俄语)`
- `5_Magyar (Hungarian-匈牙利语)`
- `7_Deutsch (German-德语)`
- `11_Français (France-法语)`
- `15_Español (Spanish-西班牙语)`
- `42_Español (Latinoamérica)(Spanish(Latin)_拉美西班牙语）`
- `Türkçe (Turkish-土耳其语)`
- `繁体中文`

If only English source content is available, fill English completely and keep the other locale column pairs with translated labels copied from the reference template where possible. Do not invent translated values unless provided.

## Section Rows

Section/category rows are merged across each locale pair.

Example rows in the reference:

- `Specifications`
- `Camera`
- `Audio and Video`
- `Network`
- `Function`
- `General`
- `In the box`
- `Certifications`

For a generated product, map PDF `Specifications` categories to the closest reference category names. Keep the source PDF category if there is no safe equivalent.

## Item Rows

For normal spec rows:

- odd column: localized item name
- even column: item value

Example:

| A | B |
|---|---|
| Image Sensor | 1/3” Progressive Scan CMOS |
| Lens | Top lens: ... |

Values with multiple lines should stay inside one cell with line breaks.

## In The Box Rule

`In the box` uses a special structure:

- Section row: pair-merged `In the box`
- Item rows: first column may be vertically merged across all box items.
- Second column lists each item on its own row, prefixed with `-`.

Example:

| A | B |
|---|---|
| In the box | - C9c Dual 3K Camera |
|  | - Drill Template |
|  | - Screw Kit |

## Certifications Rule

Use a section row merged per locale pair:

`Certifications`

Then one item row:

| A | B |
|---|---|
| Certifications | CE / UL / WEEE / RoHS / REACH |

Use the exact certifications from the product PDF/datasheet.

## Styling Rule

Use the reference workbook as the style source whenever possible:

- Copy column widths from the reference.
- Copy merged-cell layout pattern.
- Copy fills, borders, font, alignment, and wrapping from corresponding row types.
- Preserve wrapped text for long values.

## Output Rule

Generated spec Excel must match the reference file's visual format:

- multi-locale headers present
- two columns per locale
- merged section rows per locale pair
- normal item/value rows
- special `In the box` item layout
- `Certifications` at the end

## Rules Observed From `D:\产品\Ezivz`

Common camera-class spec workbooks (`C8c`, `C9c`, `EP8`, `H6c`, `H8c`) follow this pattern:

- Worksheet name is usually `Spec`.
- Standard camera specs use 52 columns: 26 column pairs.
- Each locale occupies exactly two columns:
  - first column: localized label/category/item name
  - second column: product value
- Row 1 is the locale/country header and is merged per pair.
- Row 2 is the localized `Specifications` title and is merged per pair.
- Row 3 is normally localized `Model / model value`.
- Column widths are stable:
  - first English label column about `37`
  - first English value column about `45`
  - other label columns about `37`
  - other value columns about `54`
- The last pair may be a spare/blank pair in some files; keep it when matching the 52-column template.
- Category rows are merged horizontally per locale pair.
- `In the box`:
  - section row is horizontally merged per locale pair
  - item rows use vertical merge in the first column of each locale pair
  - item values stay in the second column, one item per row
- `Certifications`:
  - section row is horizontally merged per locale pair
  - next row uses `Certifications / certification value`
- Camera-family category names vary by product. Common examples:
  - `Camera`
  - `Video & Audio`
  - `Network`
  - `Functions`
  - `Storage`
  - `General`
  - `In the box`
  - `Certifications`
- Doorbell/battery variants may use source-specific categories such as:
  - `Camera Parameters`
  - `PIR Sensor`
  - `Chime`
  - `Network Parameters`
  - `Battery`
  - `Smart Functions`
- EP8-style datasheets may also use standalone module separators such as:
  - `Video Parameters`
  - `Interface`
  - `Functions`
  - `Wi-Fi Parameters`
- A single standalone title-like line in the specifications area should be treated as a module separator, not as a parameter value continuation. Examples include `Functions`, `Network Parameters`, `General`, and `Interface`.
- Preserve the source product's category names when the category is specific and meaningful. Standalone lines such as `Interface`, `Storage`, `PIR Sensor`, `Video Parameters`, `Wi-Fi Parameters`, `General`, and `Certifications` must stay as module separators.
- Do not use RS20Max as the default camera template. It is a different product family and uses 125 columns with five-column locale blocks.

## Product Category Rule

The generator should expose a product category selector. Current category templates:

- `Camera`: camera-family upload specs, with common modules such as `Camera`, `Video & Audio`, `Network`, `Functions`, `Storage`, `General`, `In the box`, and `Certifications`.
- `Smarthome`: smart home / doorbell / battery kit specs, with modules such as `Camera Parameters`, `Video Parameters`, `PIR Sensor`, `Chime`, `Network Parameters`, `Wi-Fi Parameters`, `Battery`, `Interface`, `Functions`, `Smart Functions`, `Storage`, `General`, `In the box`, and `Certifications`.

Module recognition and section ordering should be selected from the chosen product category.

## Styling Rule For Browser Generation

The lightweight SheetJS build can generate workbook structure but does not reliably write fills, borders, and other cell styles. Browser output should therefore prefer ExcelJS when available:

- Row 1 locale headers: filled background, bold, centered, wrapped.
- Row 2 localized `Specifications`: bold, centered, wrapped.
- Row 3 model labels: label columns gray fill, bold.
- Normal parameter rows: odd/label columns gray fill and bold, even/value columns white fill.
- Section rows: merged per locale pair, bold, centered.
- All used cells: medium border and wrapped text.
- Column widths follow the observed camera-family reference widths.
