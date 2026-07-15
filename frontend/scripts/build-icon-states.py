"""Build mobile-sized visual states from the generated transparent skill icons."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ICON_NAMES = (
    "stone",
    "kill",
    "flying-kill",
    "super-kill",
    "guard",
    "high-guard",
    "low-guard",
)
SIZE = 256
ROOT = Path(__file__).resolve().parents[1] / "assets" / "icons"


def fit_icon(image: Image.Image) -> Image.Image:
    image.thumbnail((SIZE, SIZE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((SIZE - image.width) // 2, (SIZE - image.height) // 2))
    return canvas


def recolor(image: Image.Image, color: tuple[int, int, int], strength: float) -> Image.Image:
    alpha = image.getchannel("A")
    gray = ImageOps.grayscale(image.convert("RGB"))
    tinted = ImageOps.colorize(gray, black=(12, 16, 24), white=color).convert("RGBA")
    tinted.putalpha(alpha)
    return Image.blend(image, tinted, strength)


def pressed_state(normal: Image.Image) -> Image.Image:
    vivid = ImageEnhance.Contrast(normal).enhance(1.16)
    vivid = ImageEnhance.Brightness(vivid).enhance(1.08)
    inset = vivid.resize((232, 232), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", normal.size, (0, 0, 0, 0))
    result.alpha_composite(inset, (12, 18))
    return result


def cooldown_state(normal: Image.Image) -> Image.Image:
    cooled = recolor(normal, (86, 154, 180), 0.82)
    cooled = ImageEnhance.Brightness(cooled).enhance(0.58)
    alpha = cooled.getchannel("A").point(lambda value: round(value * 0.78))
    cooled.putalpha(alpha)
    return cooled


def insufficient_state(normal: Image.Image) -> Image.Image:
    muted = recolor(normal, (105, 108, 116), 0.9)
    muted = ImageEnhance.Brightness(muted).enhance(0.48)
    alpha = muted.getchannel("A").point(lambda value: round(value * 0.68))
    muted.putalpha(alpha)

    draw = ImageDraw.Draw(muted)
    draw.line((52, 204, 204, 52), fill=(229, 72, 63, 235), width=17)
    draw.line((55, 207, 207, 55), fill=(245, 233, 208, 150), width=4)
    return muted


def main() -> None:
    for name in ICON_NAMES:
        path = ROOT / f"{name}.png"
        with Image.open(path) as source:
            normal = fit_icon(source.convert("RGBA"))

        normal.save(path, optimize=True)
        pressed_state(normal).save(ROOT / f"{name}-pressed.png", optimize=True)
        cooldown_state(normal).save(ROOT / f"{name}-cooldown.png", optimize=True)
        insufficient_state(normal).save(ROOT / f"{name}-insufficient.png", optimize=True)


if __name__ == "__main__":
    main()

