#!/usr/bin/env python3
"""Draws public/og.png — the card that appears when Tilde is linked anywhere.

Same palette and same two typefaces as the site, so a shared link looks like
the page it opens. Run it again after changing the wording:

    python3 scripts/make-og.py

Needs Pillow. The two fonts are fetched from Google Fonts on first run and
cached in the system temp directory; they are not committed, because the only
thing that has to live in the repo is the PNG this produces.
"""

import pathlib
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFont

# 1200x630 is what every crawler crops to, and 2x keeps the type crisp when
# a timeline renders the card at full width on a retina screen.
SCALE = 2
W, H = 1200 * SCALE, 630 * SCALE

BG = "#f3f2f2"
TEXT = "#201e1d"
ACCENT = "#ec3013"
MUTED = "#605d5d"
RULE = "#d7d3d3"

FONTS = {
    "Archivo.ttf": "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf",
    "Caveat.ttf": "https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
}


def font_path(name: str) -> pathlib.Path:
    cache = pathlib.Path(tempfile.gettempdir()) / "tilde-og-fonts"
    cache.mkdir(exist_ok=True)
    path = cache / name
    if not path.exists():
        print(f"fetching {name}")
        urllib.request.urlretrieve(FONTS[name], path)
    return path


def archivo(size: int, weight: int = 400, width: int = 100) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(font_path("Archivo.ttf")), size * SCALE)
    face.set_variation_by_axes([weight, width])
    return face


def caveat(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(font_path("Caveat.ttf")), size * SCALE)
    face.set_variation_by_axes([weight])
    return face


def tracked(draw, xy, text, font, fill, tracking=0):
    """Pillow has no letter-spacing, and the kickers on the site are spaced
    wide enough that faking it per-glyph is the difference between matching
    the design and merely resembling it."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + tracking * SCALE
    return x


def main() -> None:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    margin = 84 * SCALE

    # The wordmark, top left, exactly as the nav sets it.
    mark = caveat(58)
    draw.text((margin, 62 * SCALE), "~ Tilde", font=mark, fill=ACCENT)

    # The headline carries the page's own promise, broken where the hero
    # breaks it, with the turn in accent.
    head = archivo(82, weight=800)
    y = 196 * SCALE
    draw.text((margin, y), "All the sites you read.", font=head, fill=TEXT)
    y += 96 * SCALE
    draw.text((margin, y), "In one place.", font=head, fill=ACCENT)

    # One sentence of substance beats a tagline nobody reads.
    sub = archivo(32, weight=400)
    y += 118 * SCALE
    draw.text(
        (margin, y),
        "A free RSS reader with no account. Your reading stays",
        font=sub,
        fill=MUTED,
    )
    draw.text((margin, y + 44 * SCALE), "on your own device.", font=sub, fill=MUTED)

    # Footer rule and the three facts a stranger needs before clicking.
    rule_y = H - 120 * SCALE
    draw.line([(margin, rule_y), (W - margin, rule_y)], fill=RULE, width=2 * SCALE)

    kicker = archivo(21, weight=600)
    tracked(
        draw,
        (margin, rule_y + 40 * SCALE),
        "WEB  ·  MACOS APP  ·  NO TRACKING  ·  OPEN SOURCE",
        kicker,
        TEXT,
        tracking=1.6,
    )

    out = pathlib.Path(__file__).resolve().parent.parent / "public" / "og.png"
    image = image.resize((1200, 630), Image.LANCZOS)
    image.save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
