import argparse
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
STORE_URL = "https://apps.apple.com/app/id6813274587"


def package(platform="itch"):
    if platform not in {"itch", "crazygames"}:
        raise ValueError("Choose itch or crazygames")
    files = {}
    for name in ["index.html", "style.css", "favicon.svg", "apple-touch-icon.png"]:
        source = ROOT / "public" / name
        if source.is_symlink():
            raise ValueError(f"Refusing a symlink: {source}")
        files[name] = source.read_bytes()
    page = files["index.html"].decode("utf-8")
    page, count = re.subn(r'<template id="game-content">.*?</template>', '', page, flags=re.DOTALL)
    if count != 1:
        raise ValueError("Expected one gameplay template")
    page = re.sub(r'<script\b[^>]*>.*?</script>', '', page, flags=re.DOTALL)
    page = re.sub(r'<meta name="(?:google-adsense-account|google-site-verification)"[^>]*>', '', page)
    for name in ["about.html", "privacy.html"]:
        page = page.replace(f'href="./{name}"', f'href="https://nookgrid.com/{name}" target="_blank" rel="noopener noreferrer"')
    files["index.html"] = page.encode("utf-8")
    destination = ROOT / "artifacts" / f"nookgrid-{platform}.zip"
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    print(json.dumps({"archive": str(destination), "files": len(files), "bytes": destination.stat().st_size, "uncompressedBytes": sum(map(len, files.values())), "analytics": False, "feedback": False, "downloadDestination": STORE_URL}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", nargs="?", choices=("itch", "crazygames"), default="itch")
    package(parser.parse_args().platform)
