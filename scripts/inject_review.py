#!/usr/bin/env python3
"""
Inject the click-to-comment review overlay into a built HTML page.

Marp regenerates the deck HTML on every build and does not include our overlay,
so run this AFTER `marp ... --html`:

    python scripts/inject_review.py slides/nilmbench2026.html

It inlines scripts/review.css + scripts/review.js before </body>. Idempotent:
re-running replaces the previous injection (delimited by sentinel comments).
Pass several files to inject into all of them.
"""
import sys, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
START, END = "<!-- nilm-review:start -->", "<!-- nilm-review:end -->"

def inject(path):
    css = open(os.path.join(HERE, "review.css"), encoding="utf-8").read()
    js = open(os.path.join(HERE, "review.js"), encoding="utf-8").read()
    block = f"{START}\n<style>\n{css}\n</style>\n<script>\n{js}\n</script>\n{END}"
    html = open(path, encoding="utf-8").read()
    html = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", html, flags=re.S)
    if "</body>" in html:
        html = html.replace("</body>", block + "\n</body>", 1)
    else:
        html += "\n" + block
    open(path, "w", encoding="utf-8").write(html)
    print("injected review overlay ->", path)

if __name__ == "__main__":
    targets = sys.argv[1:] or [os.path.join(HERE, "..", "slides", "nilmbench2026.html")]
    for t in targets:
        inject(t)
