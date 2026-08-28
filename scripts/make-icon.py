"""Render the Tilde app icon at 1024px from the same curve as public/tilde-icon.svg.

macOS icons are not full-bleed squares: the artwork sits on a rounded rect inset
from the canvas edge, so the Dock's own spacing is respected. Everything is drawn
at 4x and downsampled, which is the cheapest antialiasing available here.
"""

from PIL import Image, ImageDraw

S = 1024          # final size
SS = 4            # supersample factor
N = SS * S

BG = (243, 242, 242)      # --color-bg
INK = (236, 48, 19)       # --color-accent
EDGE = (215, 211, 211)    # --color-neutral-300, a hairline so it reads on light walls

# Apple's grid: a 1024 icon's rounded rect is 824 wide with a 185.4 corner radius.
BOX = 824 * SS
RADIUS = int(185.4 * SS)
INSET = (N - BOX) // 2


def cubic(p0, p1, p2, p3, steps=240):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        pts.append((x, y))
    return pts


img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle(
    [INSET, INSET, INSET + BOX, INSET + BOX],
    radius=RADIUS,
    fill=BG,
    outline=EDGE,
    width=int(2 * SS),
)

# The SVG curve, in its own 32x32 space:
#   M3 21 C 6.5 11.5, 12.5 11.5, 16 16 C 19.5 20.5, 25.5 20.5, 29 11
# Scaled so the stroke spans 62% of the rounded rect and sits on its optical centre.
SPAN = BOX * 0.62
scale = SPAN / 26.0                     # the curve runs x=3..29
ox = INSET + (BOX - SPAN) / 2 - 3 * scale
oy = INSET + BOX / 2 - 16 * scale


def p(x, y):
    return (ox + x * scale, oy + y * scale)


curve = cubic(p(3, 21), p(6.5, 11.5), p(12.5, 11.5), p(16, 16)) + cubic(
    p(16, 16), p(19.5, 20.5), p(25.5, 20.5), p(29, 11)
)[1:]


def stroke_outline(points, width):
    """Offset the centreline by ±width/2 along its normal.

    Pillow's own thick lines are drawn segment by segment, which leaves visible
    seams on a curve this wide. Filling one polygon does not.
    """
    half = width / 2
    left, right = [], []
    for i, (x, y) in enumerate(points):
        px, py = points[max(i - 1, 0)]
        nx, ny = points[min(i + 1, len(points) - 1)]
        dx, dy = nx - px, ny - py
        length = (dx * dx + dy * dy) ** 0.5 or 1
        ux, uy = -dy / length, dx / length      # unit normal
        left.append((x + ux * half, y + uy * half))
        right.append((x - ux * half, y - uy * half))
    return left + right[::-1]


draw.polygon(stroke_outline(curve, 4.6 * scale), fill=INK)

img.resize((S, S), Image.LANCZOS).save("src-tauri/icons/icon.png")
print("wrote src-tauri/icons/icon.png")
