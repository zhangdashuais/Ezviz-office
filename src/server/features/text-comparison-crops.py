import base64
import json
import sys
import pymupdf as fitz

payload = json.load(sys.stdin)
document = fitz.open(payload["pdfPath"])
result = []
if payload.get("mode") == "page-strips":
    for page_number in range(document.page_count):
        page = document.load_page(page_number)
        for strip in range(3):
            top = page.rect.height * strip / 3
            bottom = page.rect.height * (strip + 1) / 3
            clip = fitz.Rect(0, top, page.rect.width, bottom)
            image = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
            result.append({
                "page": page_number + 1,
                "strip": strip,
                "image": "data:image/png;base64," + base64.b64encode(image.tobytes("png")).decode("ascii")
            })
else:
    for item in payload.get("segments", []):
        page = document.load_page(int(item["page"]) - 1)
        x, y, width, height = [float(value) for value in item["bbox"]]
        clip = fitz.Rect(x, y, x + width, y + height) & page.rect
        if clip.is_empty:
            continue
        image = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip, alpha=False)
        result.append({
            "index": item["index"],
            "image": "data:image/png;base64," + base64.b64encode(image.tobytes("png")).decode("ascii")
        })
document.close()
print(json.dumps(result))
