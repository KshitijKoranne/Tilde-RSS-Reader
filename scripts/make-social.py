#!/usr/bin/env python3
"""Draws docs/social-x.png — a 16:9 product shot for posting on X.

A link card (public/og.png) is what you get when someone shares the URL. This
is different: an image you attach to a post yourself, where the point is to
show the thing working rather than describe it. The app bleeds off the bottom
edge on purpose, so the eye reads headline first and screenshot second.

    python3 scripts/make-social.py

Needs Pillow, and docs/tilde-reader.png to exist — that is the window capture
the README uses too. Fonts are cached in the temp directory by make-og.py.
"""

import pathlib
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SCALE = 2
W, H = 1600 * SCALE, 900 * SCALE

BG = "#f3f2f2"
TEXT = "#201e1d"
ACCENT = "#ec3013"
MUTED = "#605d5d"

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


def archivo(size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(font_path("Archivo.ttf")), size * SCALE)
    face.set_variation_by_axes([weight, 100])
    return face


def caveat(size: int, weight: int = 700) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(font_path("Caveat.ttf")), size * SCALE)
    face.set_variation_by_axes([weight])
    return face


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    shot_path = root / "docs" / "tilde-reader.png"
    if not shot_path.exists():
        raise SystemExit(f"missing {shot_path} — capture the app window first")

    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    margin = 96 * SCALE

    draw.text((margin, 56 * SCALE), "~ Tilde", font=caveat(52), fill=ACCENT)

    head = archivo(70, weight=800)
    draw.text((margin, 138 * SCALE), "All the sites you read.", font=head, fill=TEXT)
    draw.text((margin, 218 * SCALE), "In one place.", font=head, fill=ACCENT)

    sub = archivo(28, weight=500)
    draw.text(
        (margin, 316 * SCALE),
        "Free · no account · nothing leaves your device · Mac and web",
        font=sub,
        fill=MUTED,
    )

    # The window, scaled to a fixed width and allowed to run off the bottom.
    shot = Image.open(shot_path).convert("RGB")
    target_w = int(1180 * SCALE)
    shot = shot.resize((target_w, int(shot.height * target_w / shot.width)), Image.LANCZOS)

    x = (W - target_w) // 2
    y = int(392 * SCALE)

    # A soft shadow so the window sits on the background rather than in it.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle(
        [x + 6 * SCALE, y + 10 * SCALE, x + target_w - 6 * SCALE, H],
        fill=(32, 30, 29, 60),
    )
    image.paste(
        Image.alpha_composite(image.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(18 * SCALE))).convert("RGB"),
        (0, 0),
    )

    image.paste(shot, (x, y))
    draw = ImageDraw.Draw(image)
    draw.rectangle([x, y, x + target_w - 1, H - 1], outline="#d7d3d3", width=SCALE)

    out = root / "docs" / "social-x.png"
    image.resize((1600, 900), Image.LANCZOS).save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size // 1024} kB)")


if __name__ == "__main__":
    main()
