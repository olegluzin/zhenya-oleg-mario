"""Build the Beget package only after gameplay and SEO/privacy checks succeed."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--node", default=shutil.which("node"))
args = parser.parse_args()
if not args.node:
    parser.error("Node.js is required for release checks; provide --node if it is not on PATH")
for test in ["tests/game.cjs", "tests/seo.cjs"]:
    subprocess.run([args.node, str(root / test)], cwd=root, check=True)
files = json.loads((root / "scripts/public-files.json").read_text())
# Beget serves existing .html files through nginx, before Apache rewrite rules.
# Keep a static source for local use; publish its identical HTML via a tiny PHP
# entry point and keep index.html absent on the host so its redirect reaches Apache.
php_entry = b'''<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/index.php' || $path === '/index.html') {
    $query = isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '';
    header('Location: https://zhenya.olegluzin.ru/' . ($query !== '' ? '?' . $query : ''), true, 301);
    exit;
}
?>''' + (root / "dist/index.html").read_bytes()
payload = {("index.php" if name == "index.html" else name):
           (php_entry if name == "index.html" else (root / "dist" / name).read_bytes()) for name in files}
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, content in payload.items():
        archive.writestr(name, content)
with zipfile.ZipFile(args.output) as archive:
    assert sorted(archive.namelist()) == sorted(payload)
    assert archive.testzip() is None
manifest = {name: hashlib.sha256(content).hexdigest() for name, content in payload.items()}
args.output.with_suffix(".sha256.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Release ready: {args.output} ({len(files)} approved public files)")
