import argparse
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
MAIN_URL = "https://nookgrid.com/"
FEEDBACK_URL = MAIN_URL + "?utm_source=itch&amp;utm_medium=community&amp;utm_campaign=launch14&amp;utm_content=embed_feedback#feedback-open"
MAIN_LINK = f'<a href="{FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">the main NookGrid game</a>'


def replace_once(text, pattern, replacement):
    text, count = re.subn(pattern, lambda match: replacement, text, flags=re.DOTALL)
    if count != 1:
        raise ValueError(f"Expected one packaging match, found {count}: {pattern}")
    return text


def package(platform="itch"):
    if platform not in {"itch", "crazygames"}:
        raise ValueError("Choose itch or crazygames")
    files = {}
    for source in sorted((ROOT / "public").rglob("*")):
        if source.is_symlink():
            raise ValueError(f"Refusing a symlink: {source}")
        relative = source.relative_to(ROOT / "public")
        if not source.is_file() or any(part.startswith(".") for part in relative.parts) or relative.name in {"robots.txt", "sitemap.xml", "ads.txt"}:
            continue
        name = relative.as_posix().replace(".mjs", ".js")
        text = source.read_bytes()
        if source.suffix in {".html", ".mjs"}:
            text = text.decode("utf-8").replace(".mjs", ".js")
        if source.suffix == ".html":
            text = re.sub(r'href="\./(?=["#?])', 'href="./index.html', text)
            text = re.sub(r'<meta name="google-adsense-account"[^>]*>', '', text)
        files[name] = text

    files["site-config.json"] = json.dumps({"feedbackEnabled": False, "eventsEnabled": False, "analytics": {"enabled": False}}) + "\n"
    files["state.js"] = replace_once(files["state.js"], re.escape("const link = new URL(base);"), f"const link = new URL('{MAIN_URL}');")
    files["analytics.js"] = replace_once(files["analytics.js"], re.escape("Analytics are not connected yet."), "Analytics are disabled in this itch.io build.")
    files["index.html"] = replace_once(files["index.html"], r'<p id="feedback-unavailable"[^>]*>.*?</p>', f'<p id="feedback-unavailable" class="notice">To send a private note, open {MAIN_LINK} and choose Give feedback. You can also leave a public comment on this itch.io game page.</p>')
    files["index.html"] = replace_once(files["index.html"], r'<p>Basic analytics help us improve the puzzles\..*?</p>', '<p>This itch.io build does not collect play analytics.</p>')
    files["privacy.html"] = replace_once(files["privacy.html"], r'<h2>Basic play analytics</h2>.*?(?=<h2>Ads and questions</h2>)', f'<h2>Play analytics</h2><p>This itch.io build does not load PostHog or send play analytics. Progress stays in this browser.</p><h2>Feedback you choose to send</h2><p>The feedback form is disabled in this build. To send a private note, open {MAIN_LINK} and choose Give feedback. The <a href="{MAIN_URL}privacy.html" target="_blank" rel="noopener noreferrer">main game\'s privacy notes</a> apply there. Comments on the itch.io game page are public. Please leave personal or sensitive information out of feedback and comments.</p><h2>Hosting</h2><p>This version is hosted by itch.io. Its services are covered by <a href="https://itch.io/docs/legal/privacy-policy" target="_blank" rel="noopener noreferrer">itch.io\'s privacy policy</a>. Saved progress in this embedded game is separate from progress on the main NookGrid site.</p>')
    if platform == "crazygames":
        files["state.js"] = replace_once(files["state.js"], r'\n  const link = new URL\(.*?(?=\n  return `NookGrid)', "")
        files["state.js"] = replace_once(files["state.js"], re.escape(r'\n${link.href}'), "")
        files["analytics.js"] = files["analytics.js"].replace("this itch.io build", "this CrazyGames build")
        files["index.html"] = replace_once(files["index.html"], r'<p id="feedback-unavailable"[^>]*>.*?</p>', '<p id="feedback-unavailable" class="notice">Use the game rating controls on CrazyGames to leave feedback.</p>')
        files["index.html"] = files["index.html"].replace("This itch.io build does not collect play analytics.", "This build does not send play analytics to NookGrid. CrazyGames provides its own platform metrics.")
        files["privacy.html"] = replace_once(files["privacy.html"], r'<h2>Play analytics</h2>.*?(?=<h2>Ads and questions</h2>)', '<h2>Play analytics</h2><p>This build does not load PostHog or send play analytics to NookGrid. Progress stays in this browser.</p><h2>Feedback</h2><p>This build does not send feedback to NookGrid directly. You can use the game rating controls on CrazyGames.</p><h2>Hosting</h2><p>When this game is hosted on CrazyGames, its platform analytics and feedback are covered by <a href="https://www.crazygames.com/privacy-policy" target="_blank" rel="noopener noreferrer">CrazyGames\' privacy policy</a>. Saved progress is separate from other versions of NookGrid.</p>')
        for name in ("index.html", "about.html", "privacy.html"):
            files[name] = re.sub(r'<(?:link rel="canonical"|meta property="og:)[^>]*>', "", files[name])
        files["style.css"] += b'''
@media(min-width:681px) and (max-height:720px){
  .site-header{height:40px}.intro{display:none}.game-layout{padding:8px 16px;gap:24px}
  .board-top{margin-bottom:6px}.board-wrap{width:min(100%,max(180px,calc(100vh - 260px)));margin-inline:auto;padding:8px 8px 20px}
  .board{gap:5px}.lot svg{width:64%;max-height:64%}.lot .place-name{font-size:9px}
  .selection-bar{min-height:26px;padding:0}.place-tray{grid-template-columns:repeat(5,1fr);gap:4px}
  .place{height:44px;padding:2px}.place svg{width:32px;height:27px}.place-name{font-size:10px}
  .board-actions{margin-top:8px}.board-note{display:none}.clue-intro{margin:6px 0}
  .clues{gap:4px}.clue{min-height:28px;padding:5px 8px;font-size:12px}.clue-key{margin-top:6px}
}
'''
    encoded = {name: text.encode("utf-8") if isinstance(text, str) else text for name, text in files.items()}
    if "index.html" not in encoded or len(encoded) > 1000 or any(len(name) > 240 for name in encoded):
        raise ValueError("The ZIP does not meet itch.io entry-point or filename limits")
    if sum(map(len, encoded.values())) > 500_000_000 or any(len(data) > 200_000_000 for data in encoded.values()):
        raise ValueError("The ZIP exceeds itch.io size limits")
    destination = ROOT / "artifacts" / f"nookgrid-{platform}.zip"
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in encoded.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    print(json.dumps({"archive": str(destination), "files": len(encoded), "bytes": destination.stat().st_size, "uncompressedBytes": sum(map(len, encoded.values())), "analytics": False, "feedback": False, "shareDestination": MAIN_URL if platform == "itch" else None}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("platform", nargs="?", choices=("itch", "crazygames"), default="itch")
    package(parser.parse_args().platform)
