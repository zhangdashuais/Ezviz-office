import json
import mimetypes
import sys
from pathlib import Path

import requests


UPLOAD_URL = "https://fs.ezvizlife.com/upload.php"
DEFAULT_IMAGE_PATH = Path(r"D:\自动图片上传\image\image.png")


def upload_image(image_path: Path) -> tuple[int, dict]:
    if not image_path.exists():
        raise FileNotFoundError(f"图片不存在: {image_path}")

    mime_type, _ = mimetypes.guess_type(str(image_path))
    mime_candidates = [
        mime_type,
        "image/png",
        "image/jpeg",
        "application/octet-stream",
    ]
    mime_candidates = list(dict.fromkeys([m for m in mime_candidates if m]))

    headers = {
        "lang": "zh-CN",
        "Origin": "https://ecadmin.ys7.com",
        "Referer": "https://ecadmin.ys7.com/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/138.0.0.0 Safari/537.36"
        ),
    }

    data_candidates = [
        {
            "app": "mall",
            "flag": "op_image",
            "quality": "100",
            "adapt": "1",
        },
        {
            "app": "mall",
            "mall": "1",
            "flag": "1",
            "cover": "1",
            "quality": "100",
            "adapt": "1",
        },
        {"app": "mall", "quality": "100", "adapt": "1"},
        {"quality": "100", "adapt": "1"},
        {},
    ]

    last_status = 0
    last_payload: dict = {}
    max_attempts = 6
    attempts = 0

    for data in data_candidates:
        for mime in mime_candidates:
            attempts += 1
            if attempts > max_attempts:
                return last_status, last_payload
            try:
                with image_path.open("rb") as image_file:
                    files = {
                        "file": (image_path.name, image_file, mime),
                    }
                    response = requests.post(
                        UPLOAD_URL,
                        headers=headers,
                        data=data,
                        files=files,
                        timeout=8,
                    )
            except requests.RequestException as req_err:
                print(f"尝试 data={data or '{}'} mime={mime} -> 请求异常: {req_err}")
                continue

            last_status = response.status_code
            try:
                payload = response.json()
            except ValueError:
                payload = {"raw_text": response.text}

            print(f"尝试 data={data or '{}'} mime={mime} -> status={response.status_code}")
            print("返回:", json.dumps(payload, ensure_ascii=False))

            last_payload = payload
            if payload.get("full_url") or payload.get("uri"):
                return response.status_code, payload

    return last_status, last_payload


def main() -> None:
    image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IMAGE_PATH
    status_code, payload = upload_image(image_path)

    print("最终状态码:", status_code)
    print("原始响应:", json.dumps(payload, ensure_ascii=False))

    full_url = payload.get("full_url")
    if full_url:
        print("图片地址:", full_url)
        return

    uri = payload.get("uri")
    if uri:
        fallback_url = f"https://mfs.ezvizlife.com/{uri.lstrip('/')}"
        print("图片地址(兜底拼接):", fallback_url)
        return

    print("未在响应中找到图片地址字段，请检查原始响应。")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("上传失败:", exc)