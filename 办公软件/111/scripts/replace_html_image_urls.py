import re
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional

from test import upload_image


IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".svg",
    ".avif",
}


def is_relative_local_url(url: str) -> bool:
    lower = url.lower().strip()
    if not lower:
        return False
    if lower.startswith(("http://", "https://", "//", "data:", "javascript:", "#")):
        return False
    return True


def split_url_suffix(url: str) -> Tuple[str, str]:
    # Keep query/hash unchanged after replacement.
    for marker in ("?", "#"):
        idx = url.find(marker)
        if idx != -1:
            return url[:idx], url[idx:]
    return url, ""


def looks_like_image_path(url_path: str) -> bool:
    return Path(url_path).suffix.lower() in IMAGE_EXTENSIONS


def upload_and_get_url(abs_path: Path) -> str:
    status_code, payload = upload_image(abs_path)
    if payload.get("full_url"):
        return payload["full_url"]
    if payload.get("uri"):
        return f"https://mfs.ezvizlife.com/{str(payload['uri']).lstrip('/')}"
    raise RuntimeError(f"上传失败 status={status_code}, payload={payload}")


def build_mapping(html_text: str, html_path: Path, assets_base_dir: Optional[Path] = None) -> Dict[str, str]:
    mapping: Dict[str, str] = {}

    attr_pattern = re.compile(r"\b(?:src|href)=([\"'])([^\"']+)\1", re.IGNORECASE)
    srcset_pattern = re.compile(r"\bsrcset=([\"'])(.*?)\1", re.IGNORECASE | re.DOTALL)
    css_url_pattern = re.compile(r"url\(([^)]+)\)", re.IGNORECASE)

    candidates: List[str] = []

    for m in attr_pattern.finditer(html_text):
        candidates.append(m.group(2).strip())

    for m in srcset_pattern.finditer(html_text):
        srcset_value = m.group(2)
        for item in srcset_value.split(","):
            part = item.strip()
            if not part:
                continue
            url_part = part.split()[0]
            candidates.append(url_part)

    for m in css_url_pattern.finditer(html_text):
        raw = m.group(1).strip().strip('"\'')
        candidates.append(raw)

    unique_candidates: List[str] = []
    seen = set()
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        unique_candidates.append(c)

    for rel_url in unique_candidates:
        if not is_relative_local_url(rel_url):
            continue
        url_path, _suffix = split_url_suffix(rel_url)
        if not looks_like_image_path(url_path):
            continue

        base_dir = assets_base_dir or html_path.parent
        abs_path = (base_dir / url_path).resolve()
        if not abs_path.exists() or not abs_path.is_file():
            print(f"跳过(文件不存在): {rel_url}")
            continue

        print(f"上传中: {rel_url}")
        try:
            mapping[rel_url] = upload_and_get_url(abs_path)
            print(f"替换为: {mapping[rel_url]}")
        except Exception as exc:
            print(f"跳过(上传失败): {rel_url}, 原因: {exc}")

    return mapping


def replace_attr_urls(html_text: str, mapping: Dict[str, str]) -> str:
    pattern = re.compile(r"(\b(?:src|href)=([\"']))([^\"']+)(\2)", re.IGNORECASE)

    def repl(match: re.Match) -> str:
        full_prefix = match.group(1)
        old_url = match.group(3)
        full_suffix = match.group(4)
        new_url = mapping.get(old_url, old_url)
        return f"{full_prefix}{new_url}{full_suffix}"

    return pattern.sub(repl, html_text)


def replace_srcset_urls(html_text: str, mapping: Dict[str, str]) -> str:
    pattern = re.compile(r"(\bsrcset=([\"']))(.*?)(\2)", re.IGNORECASE | re.DOTALL)

    def repl(match: re.Match) -> str:
        prefix = match.group(1)
        value = match.group(3)
        suffix = match.group(4)

        new_items = []
        for item in value.split(","):
            trimmed = item.strip()
            if not trimmed:
                new_items.append(item)
                continue
            parts = trimmed.split()
            old_url = parts[0]
            descriptor = " ".join(parts[1:])
            replaced = mapping.get(old_url, old_url)
            if descriptor:
                new_items.append(f"{replaced} {descriptor}")
            else:
                new_items.append(replaced)

        return f"{prefix}{', '.join(new_items)}{suffix}"

    return pattern.sub(repl, html_text)


def replace_css_url(html_text: str, mapping: Dict[str, str]) -> str:
    pattern = re.compile(r"url\(([^)]+)\)", re.IGNORECASE)

    def repl(match: re.Match) -> str:
        raw = match.group(1)
        stripped = raw.strip()
        quote = ""
        if stripped.startswith(('"', "'")) and stripped.endswith(('"', "'")):
            quote = stripped[0]
            old_url = stripped[1:-1]
        else:
            old_url = stripped

        new_url = mapping.get(old_url, old_url)
        if quote:
            return f"url({quote}{new_url}{quote})"
        return f"url({new_url})"

    return pattern.sub(repl, html_text)


def replace_html_image_urls(
    html_path: Path,
    assets_base_dir: Optional[Path] = None,
    in_place: bool = False,
) -> Path:
    html_text = html_path.read_text(encoding="utf-8")
    mapping = build_mapping(html_text, html_path, assets_base_dir=assets_base_dir)

    replaced = replace_attr_urls(html_text, mapping)
    replaced = replace_srcset_urls(replaced, mapping)
    replaced = replace_css_url(replaced, mapping)

    output_html = html_path if in_place else html_path.with_name(f"{html_path.stem}.uploaded.html")
    output_map = html_path.with_name(f"{html_path.stem}.url_map.txt")

    output_html.write_text(replaced, encoding="utf-8")
    output_map.write_text(
        "\n".join([f"{k} -> {v}" for k, v in mapping.items()]),
        encoding="utf-8",
    )

    print("\n替换完成")
    print(f"总替换数量: {len(mapping)}")
    print(f"新HTML: {output_html}")
    print(f"映射文件: {output_map}")
    return output_html


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="上传 HTML 中的本地图片并替换为远程 URL。",
    )
    parser.add_argument(
        "--html",
        dest="html_files",
        nargs="+",
        required=False,
        help="要处理的 HTML 文件路径，可传多个。",
    )
    parser.add_argument(
        "--assets-base-dir",
        dest="assets_base_dir",
        default=None,
        help="资源解析基准目录。未传时默认使用 HTML 所在目录。",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="直接覆盖原 HTML 文件。",
    )
    return parser.parse_args()


def collect_html_files_from_cwd() -> List[Path]:
    cwd = Path.cwd()
    return sorted(
        [p for p in cwd.iterdir() if p.is_file() and p.suffix.lower() == ".html"],
        key=lambda p: p.name.lower(),
    )


def choose_html_files_interactively() -> List[Path]:
    html_files = collect_html_files_from_cwd()
    if not html_files:
        print(f"当前目录没有可选 HTML 文件: {Path.cwd()}")
        return []

    print(f"当前目录: {Path.cwd()}")
    print("可选 HTML 文件:")
    for i, html in enumerate(html_files, start=1):
        print(f"  {i}. {html.name}")

    print("请输入编号(如: 1,3) 或 all 处理全部:")

    while True:
        raw = input("> ").strip().lower()
        if not raw:
            print("输入为空，请重新输入。")
            continue

        if raw in {"all", "a", "*"}:
            return html_files

        parts = [p.strip() for p in raw.split(",") if p.strip()]
        selected_indexes: List[int] = []
        valid = True

        for part in parts:
            if not part.isdigit():
                valid = False
                break

            idx = int(part)
            if idx < 1 or idx > len(html_files):
                valid = False
                break

            if idx not in selected_indexes:
                selected_indexes.append(idx)

        if not valid or not selected_indexes:
            print("输入无效，请输入编号列表(如 1,2) 或 all。")
            continue

        return [html_files[i - 1] for i in selected_indexes]


def main() -> None:
    args = parse_args()
    assets_base_dir = Path(args.assets_base_dir).resolve() if args.assets_base_dir else None

    html_inputs = args.html_files
    if not html_inputs:
        selected_files = choose_html_files_interactively()
        if not selected_files:
            return
        html_inputs = [str(p) for p in selected_files]

    for html_file in html_inputs:
        html_path = Path(html_file).resolve()
        if not html_path.exists():
            print(f"跳过(HTML 不存在): {html_path}")
            continue
        if html_path.suffix.lower() != ".html":
            print(f"跳过(非 HTML 文件): {html_path}")
            continue

        print("\n" + "=" * 72)
        print(f"开始处理: {html_path}")
        if assets_base_dir:
            print(f"资源基准目录: {assets_base_dir}")
        replace_html_image_urls(
            html_path,
            assets_base_dir=assets_base_dir,
            in_place=args.in_place,
        )


if __name__ == "__main__":
    main()
