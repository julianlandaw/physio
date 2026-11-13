"""Run formatting, generated-data, link, and headless browser checks."""

import functools
import http.server
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
from collections import Counter
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.lines = [], [], []
        self.status = None
        self.collect = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        self.links.extend(attrs[k] for k in ("src", "href") if attrs.get(k))
        if tag == "body":
            self.status = attrs.get("data-result")
        if tag == "pre" and attrs.get("id") == "results":
            self.collect = True

    def handle_endtag(self, tag):
        if tag == "pre":
            self.collect = False

    def handle_data(self, data):
        if self.collect:
            self.lines.append(data)


def check_links():
    root = ROOT / "docs"
    pages = {}
    for path in root.rglob("*.html"):
        page = Page()
        page.feed(path.read_text())
        pages[path.resolve()] = page
    errors = []
    for path, page in pages.items():
        errors.extend(
            f"{path}: duplicate ID {name}"
            for name, count in Counter(page.ids).items()
            if count > 1
        )
        for link in page.links:
            url = urlsplit(link)
            if url.scheme or url.netloc or url.path.lower().endswith(".pdf"):
                continue
            if url.path:
                decoded = unquote(url.path)
                target = (
                    root / decoded.lstrip("/")
                    if decoded.startswith("/")
                    else path.parent / decoded
                ).resolve()
            else:
                target = path
            if not target.exists():
                errors.append(f"{path}: missing {link}")
            elif (
                url.fragment
                and target in pages
                and unquote(url.fragment) not in pages[target].ids
            ):
                errors.append(f"{path}: missing anchor {link}")
    if errors:
        raise RuntimeError("\n".join(errors))
    print("PASS local links, anchors, and IDs")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    os.chdir(ROOT)
    subprocess.run([sys.executable, "scripts/generate_presets.py", "--check"], check=True)
    prettier = shutil.which("prettier")
    if not prettier:
        local = ROOT / "node_modules/.bin/prettier"
        prettier = str(local) if local.exists() else None
    if not prettier:
        raise RuntimeError("Install the formatter first: npm ci")
    patterns = [
        "README.md", "package*.json", ".prettierrc.json", ".github/workflows/*.yml",
        "docs/**/*.html", "docs/assets/css/*.css", "docs/assets/js/*.js",
        "docs/Pharmacology/drug_registry.json", "tests/*.html", "tests/*.js",
    ]
    subprocess.run([prettier, "--check", *patterns], check=True)
    check_links()
    browser = next(
        (path for name in ("chromium", "google-chrome", "google-chrome-stable")
         if (path := shutil.which(name))),
        None,
    )
    if not browser:
        raise RuntimeError("Install Chromium or Google Chrome to run the browser checks.")
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        suites = (
            "threecompartmentmodel.browser.html?long=1", "csht.browser.html",
            "site.browser.html", "recovery.browser.html",
            "editing.browser.html",
            "results.browser.html",
            "ventilation.browser.html",
            "ventilation_features.browser.html",
        )
        for suite in suites:
            with tempfile.TemporaryDirectory(prefix="physio-browser-") as profile:
                command = [
                    browser, "--headless", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-breakpad",
                    "--disable-crash-reporter", f"--user-data-dir={profile}",
                    "--virtual-time-budget=30000", "--dump-dom",
                    f"http://127.0.0.1:{server.server_port}/tests/{suite}",
                ]
                result = subprocess.run(
                    command, capture_output=True, text=True, timeout=90
                )
                page = Page()
                page.feed(result.stdout)
                report = "".join(page.lines)
                if result.returncode or page.status != "passed":
                    raise RuntimeError(
                        f"{suite}: {page.status}\n{report}\n{result.stderr[-1000:]}"
                    )
                count = sum(line.startswith("PASS ") for line in report.splitlines())
                print(f"PASS {suite}: {count} checks")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
