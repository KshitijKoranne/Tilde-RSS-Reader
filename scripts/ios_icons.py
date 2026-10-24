"""Run from the repo root AFTER `npm run ios:init`. Draws Tilde full-bleed (iOS applies its own mask),
and writes every AppIcon size listed in gen/apple's Contents.json as opaque RGB (no alpha channel)."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

SET = Path(sys.argv[1] if len(sys.argv) > 1 else "src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset")
S, SS = 1024, 4
N = S * SS
BG, INK = (243, 242, 242), (236, 48, 19)   # same colours as scripts/make-icon.py


def cubic(p0, p1, p2, p3, steps=240):
    out = []
    for i in range(steps + 1):
        t = i / steps; u = 1 - t
        out.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return out


span = N * 0.52                       # the Mac icon's glyph is 62% of an 824px box = 50% of 1024
scale = span / 26.0
ox, oy = (N - span) / 2 - 3 * scale, N / 2 - 16 * scale
p = lambda x, y: (ox + x * scale, oy + y * scale)
curve = cubic(p(3, 21), p(6.5, 11.5), p(12.5, 11.5), p(16, 16)) + cubic(p(16, 16), p(19.5, 20.5), p(25.5, 20.5), p(29, 11))[1:]
half, left, right = 4.6 * scale / 2, [], []
for i, (x, y) in enumerate(curve):
    px, py = curve[max(i - 1, 0)]; nx, ny = curve[min(i + 1, len(curve) - 1)]
    dx, dy = nx - px, ny - py; l = (dx*dx + dy*dy) ** 0.5 or 1
    ux, uy = -dy / l, dx / l
    left.append((x + ux*half, y + uy*half)); right.append((x - ux*half, y - uy*half))
img = Image.new("RGB", (N, N), BG)
ImageDraw.Draw(img).polygon(left + right[::-1], fill=INK)
master = img.resize((S, S), Image.LANCZOS)

n = 0
for e in json.loads((SET / "Contents.json").read_text())["images"]:
    w = float(e["size"].split("x")[0]); px = round(w * int(e["scale"][0]))
    master.resize((px, px), Image.LANCZOS).save(SET / e["filename"]); n += 1
print(f"wrote {n} icons, all RGB, into {SET}")
