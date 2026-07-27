"""Generate assets/og-image.png — the social preview card for shared links.

Run this only when the branding or tagline changes; the generated PNG is committed
so production never needs an image library:

    py -m pip install Pillow      # dev-only, NOT in requirements.txt
    py scripts/make_og_image.py

Output is 1200x630, the size every major platform (iMessage, WeChat, Discord,
Twitter/X, LinkedIn) crops its link preview from.
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "og-image.png")

W, H = 1200, 630
BG = "#f3f5f9"        # --bg
CARD = "#ffffff"      # --card
TEXT = "#1f2937"      # --text
MUTED = "#6b7280"     # --muted
PRIMARY = "#2563eb"   # --primary
GREEN = "#2f855a"     # completion/success accent

# Windows/macOS/Linux candidates; first hit wins.
BOLD_FONTS = [
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
REGULAR_FONTS = [
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def load(candidates, size):
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit("No usable font found; add one to the candidate list.")


def draw_check(d, x, y, size, color, width=4):
    """Stroke a checkmark instead of typing one.

    Core text fonts (Arial) have no U+2713 glyph, so drawing "✓" renders a tofu
    box. Lines are font-independent and render identically everywhere.
    """
    d.line(
        [
            (x, y + size * 0.55),
            (x + size * 0.38, y + size * 0.92),
            (x + size * 0.98, y + size * 0.12),
        ],
        fill=color,
        width=width,
        joint="curve",
    )


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Card with a primary-colored left rail, mirroring the in-app welcome card.
    pad = 48
    d.rounded_rectangle([pad, pad, W - pad, H - pad], radius=28, fill=CARD)
    d.rounded_rectangle([pad, pad, pad + 14, H - pad], radius=7, fill=PRIMARY)

    x = pad + 68
    f_mark = load(BOLD_FONTS, 44)
    f_head = load(BOLD_FONTS, 62)
    f_bullet = load(REGULAR_FONTS, 31)
    f_foot = load(REGULAR_FONTS, 27)

    # Wordmark: "Study" dark + "Boost" primary, matching the in-app hero.
    y = pad + 54
    d.text((x, y), "Study", font=f_mark, fill=TEXT)
    d.text((x + d.textlength("Study", font=f_mark), y), "Boost", font=f_mark, fill=PRIMARY)

    y += 92
    for line in ("Turn your notes into", "adaptive AP practice."):
        d.text((x, y), line, font=f_head, fill=TEXT)
        y += 74

    y += 26
    bullets = (
        "AI practice questions from your own notes",
        "Mistakes come back on a spaced schedule",
        "Topic mastery shows what to review next",
    )
    for line in bullets:
        draw_check(d, x + 2, y + 4, 26, GREEN)
        d.text((x + 44, y), line, font=f_bullet, fill=MUTED)
        y += 46

    d.text((x, H - pad - 60), "studyboostai.pythonanywhere.com", font=f_foot, fill=PRIMARY)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print("wrote {} ({}x{}, {} bytes)".format(OUT, W, H, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
