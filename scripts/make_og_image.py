"""Generate assets/og-image.png — the social preview card for shared links.

Run this only when the branding or tagline changes; the generated PNG is committed
so production never needs an image library:

    py -m pip install Pillow      # dev-only, NOT in requirements.txt
    py scripts/make_og_image.py

Output is 1200x630, the size every major platform (iMessage, WeChat, Discord,
Twitter/X, LinkedIn) crops its link preview from. Colors and fonts match
docs/DESIGN-SYSTEM.md.
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "og-image.png")
FONTS = os.path.join(ROOT, "assets", "fonts")

W, H = 1200, 630
SCALE = 2             # draw at 2x, then downsample, for smooth diagonals and rings
FIELD = "#0C97E6"     # --field
BLACK = "#02050B"     # --black
WHITE = "#F5F8FF"     # --white
CYAN = "#00D9FF"      # --cyan
WARN = "#E6F24A"      # --warn


def display(size):
    return ImageFont.truetype(os.path.join(FONTS, "BigShoulders-Bold.woff"), size * SCALE)


def text_font(size):
    return ImageFont.truetype(os.path.join(FONTS, "InstrumentSans-Regular.woff"), size * SCALE)


def px(*values):
    return [v * SCALE for v in values]


def draw_rings(d, cx, cy):
    """The review rings from the Home page: real SM-2 spacing, a black 'due' core."""
    for r in (88, 140, 186, 232):
        d.ellipse(px(cx - r, cy - r, cx + r, cy + r), outline=WHITE, width=2 * SCALE)
    d.ellipse(px(cx - 52, cy - 52, cx + 52, cy + 52), fill=BLACK)
    for x, y in ((-16, -18), (20, -6), (-8, 22)):
        d.ellipse(px(cx + x - 7, cy + y - 7, cx + x + 7, cy + y + 7), fill=WARN)
    for x, y in ((62, -62), (-132, 44), (98, 104), (-68, -170), (164, 128), (214, -84)):
        d.ellipse(px(cx + x - 9, cy + y - 9, cx + x + 9, cy + y + 9), fill=BLACK)


def draw_side_word(img, word):
    """Set the big rotated word down the left edge, like the app's title band."""
    font = display(190)
    size = (int(font.getlength(word)) + 40, 260 * SCALE)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((0, 0), word, font=font, fill=BLACK)
    layer = layer.rotate(-90, expand=True)
    img.paste(layer, (-44 * SCALE, 14 * SCALE), layer)


def main():
    img = Image.new("RGB", (W * SCALE, H * SCALE), FIELD)
    d = ImageDraw.Draw(img)

    draw_rings(d, 930, 262)
    draw_side_word(img, "STUDY")

    # Headline.
    x = 214
    y = 44
    f_head = display(100)
    for line in ("TURN YOUR NOTES", "INTO ADAPTIVE", "AP PRACTICE."):
        d.text(px(x, y), line, font=f_head, fill=BLACK)
        y += 96

    f_body = text_font(28)
    d.text(px(x, y + 20), "Missed questions come back", font=f_body, fill=BLACK)
    d.text(px(x, y + 58), "until they stick.", font=f_body, fill=BLACK)

    # Diagonal black floor with the wordmark, the same cut as the Home hero.
    d.polygon(px(0, H, 0, 566, W, 478, W, H), fill=BLACK)
    f_mark = display(56)
    d.text(px(40, 556), "Study", font=f_mark, fill=WHITE)
    d.text(px(40 + d.textlength("Study", font=f_mark) / SCALE, 556), "Boost", font=f_mark, fill=CYAN)
    url = "studyboostai.pythonanywhere.com"
    f_url = text_font(25)
    d.text(px(W - 40 - d.textlength(url, font=f_url) / SCALE, 572), url, font=f_url, fill=WHITE)

    img = img.resize((W, H), Image.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print("wrote {} ({}x{}, {} bytes)".format(OUT, W, H, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
