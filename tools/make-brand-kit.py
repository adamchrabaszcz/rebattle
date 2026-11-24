"""Zips the brand files for the /brand page's "Download everything": public/brand/rebattle-brand.zip.

Run from the repo root, last (after tools/make-logo.py, tools/make-icons.py and the PNG
screenshots):  python3 tools/make-brand-kit.py
No dependencies. The same files always give the same zip (fixed dates, sorted names), so it only
changes in git when a file in it does; tests/brand.test.js fails if it is out of date.
"""
import os
import zipfile

BRAND = 'public/brand'
ZIP = f'{BRAND}/rebattle-brand.zip'
EXTRA = {'share-preview.png': 'public/icons/share-preview.png'}  # served from icons/ for the link tags
README = """rebattle brand kit
==================

logos/      full, name, mark and badge, each on-dark, on-light, mono-dark, mono-white (SVG + PNG)
instagram/  the profile picture, and the video cover for Reels and Stories (1080x1920)
how/        how the logo is made: the steps, and the whole sheet (SVG + PNG)
share-preview.png / .svg   the link preview (1200x630)
logo-usage.svg             do's and don'ts

How to use them, the colours and the type: https://rebattle.app/brand
The rebattle name and logo are not under the code's MIT licence. Use them to show that your event
runs on rebattle; not as your own brand or for a copy of the app.
"""


def files():
    for root, _, names in os.walk(BRAND):
        for name in names:
            path = os.path.join(root, name)
            if path != ZIP and not name.startswith('.'):
                yield os.path.relpath(path, BRAND), path
    for arcname, path in EXTRA.items():
        yield arcname, path


def add(z, arcname, data):
    info = zipfile.ZipInfo(arcname, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    z.writestr(info, data)


with zipfile.ZipFile(ZIP, 'w') as z:
    add(z, 'README.txt', README)
    for arcname, path in sorted(files()):
        add(z, arcname, open(path, 'rb').read())
print(f'{ZIP}: {os.path.getsize(ZIP) // 1024} KB')
