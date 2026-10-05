"""Generate favicons and the Open Graph share image.

Drawn with Pillow rather than committed as opaque binaries, so the artwork is
reproducible and reviewable.

The share card shows a REAL record from the dataset, with its REAL provenance:
'Shock Absorber Lower Mounting Bolt', 220 N·m / 162 lb ft, tier A because two
independent sources corroborate the manual. Nothing on the card is invented —
an earlier draft captioned it "GM bulletin", which was false for this fastener
(it is not superseded), and that is exactly the kind of claim a share image
must not make.

    python scripts/make_images.py
"""
from PIL import Image, ImageDraw, ImageFont
import math
import pathlib

BG = (15, 18, 22)
ACCENT = (78, 161, 255)
TEXT = (255, 255, 255)
MUTED = (139, 152, 169)
PANEL = (28, 34, 43)
LINE = (42, 50, 61)
OK_BG, OK_LINE, OK_FG = (16, 53, 27), (29, 92, 46), (63, 185, 80)

PUB = pathlib.Path(__file__).resolve().parent.parent / "public"


def hexagon(cx, cy, r, rot=math.pi / 2):
    return [(cx + r * math.cos(rot + i * math.pi / 3),
             cy + r * math.sin(rot + i * math.pi / 3)) for i in range(6)]


def icon(size: int) -> Image.Image:
    """A hex socket — the thing the whole tool is about."""
    ss = size * 4  # supersample for clean edges at small sizes
    im = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, ss - 1, ss - 1], radius=int(ss * 0.205), fill=BG)
    c = ss / 2
    d.polygon(hexagon(c, c, ss * 0.33), outline=ACCENT, width=max(2, int(ss * 0.072)))
    d.polygon(hexagon(c, c, ss * 0.165), outline=TEXT, width=max(2, int(ss * 0.056)))
    return im.resize((size, size), Image.LANCZOS)


def font(size, bold=False):
    names = ("segoeuib.ttf", "arialbd.ttf") if bold else ("segoeui.ttf", "arial.ttf")
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def mono(size):
    for name in ("consola.ttf", "cour.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    PUB.mkdir(exist_ok=True)
    for n in (16, 32, 48, 180, 192, 512):
        icon(n).save(PUB / f"icon-{n}.png")
    icon(256).save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    W, H = 1200, 630
    og = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(og)
    d.rectangle([0, 0, W, 6], fill=ACCENT)

    badge = icon(96)
    og.paste(badge, (72, 64), badge)
    d.text((190, 72), "Torque Spec Finder", font=font(52, True), fill=TEXT)
    d.text((193, 136), "refuses to guess", font=font(27), fill=MUTED)

    d.rounded_rectangle([72, 214, W - 72, 470], radius=16, fill=PANEL, outline=LINE, width=2)
    d.text((104, 240), "Rear Shock Absorber Lower Mounting Bolt", font=font(26, True), fill=TEXT)
    d.text((104, 278), "Chassis  \u203a  Rear Suspension  \u203a  rear \u00b7 lower",
           font=font(19), fill=MUTED)

    # lb-ft first, then N\u00b7m — the order the app itself uses.
    for i, (val, unit) in enumerate([("162", "lb ft"), ("220", "N\u00b7m")]):
        x = 104 + i * 300
        d.rounded_rectangle([x, 320, x + 256, 442], radius=10, fill=(22, 27, 34),
                            outline=LINE, width=2)
        d.text((x + 22, 338), val, font=mono(62), fill=TEXT)
        d.text((x + 22, 408), unit, font=mono(22), fill=MUTED)

    d.rounded_rectangle([706, 320, W - 104, 442], radius=10, fill=OK_BG, outline=OK_LINE, width=2)
    d.text((728, 340), "TIER A", font=mono(26), fill=OK_FG)
    d.text((728, 380), "GM manual", font=font(21), fill=OK_FG)
    d.text((728, 408), "+ 2 sources agree", font=font(19), fill=MUTED)

    d.text((72, 516), "708 fasteners  \u00b7  2003 C5 Corvette  \u00b7  every value traced to its source",
           font=font(24), fill=MUTED)
    d.text((72, 556), "Abstains instead of guessing  \u00b7  0 wrong answers on 62 golden queries",
           font=font(24), fill=MUTED)

    og.save(PUB / "og.png", optimize=True)
    print("wrote", len(list(PUB.iterdir())), "files to", PUB)


if __name__ == "__main__":
    main()
