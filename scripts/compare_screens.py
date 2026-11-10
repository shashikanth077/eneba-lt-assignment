#!/usr/bin/env python3
"""
Builds the side-by-side images in docs/screens/compare/: the reference frame (from the screen recording of eneba.com) on the left and our
screenshot of the matching screen on the right, both cropped to the same size, with captions.

    python3 scripts/compare_screens.py <ours-dir> <out-dir>      e.g.  docs/screens/before docs/screens/compare/before
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'docs' / 'screens'
# (output name, reference frame, our screenshot, caption)
PAIRS = [
    ('01-home', 'ref-001.png', 'desktop-01-home.png', 'Home: header, category bar, hero'),
    ('02-cards', 'ref-007.png', 'desktop-02-home-cards.png', 'Home: product cards'),
    ('03-store', 'ref-014.png', 'desktop-03-store.png', 'Store: filters, results header, cards'),
    ('04-product', 'ref-013.png', 'desktop-04-product.png', 'Product page'),
    ('05-register', 'ref-006.png', 'desktop-05-register.png', 'Register'),
    ('06-cart', 'ref-016.png', 'desktop-06-cart.png', 'Cart'),
    ('07-checkout', 'ref-016.png', 'desktop-07-checkout.png', 'Checkout (reference: its cart/checkout page)'),
]


def load(directory: Path, name: str) -> Image.Image:
    """Screenshots are kept as .jpg in the repository (small) but a fresh capture is .png: either works."""
    for extension in ('.png', '.jpg'):
        candidate = directory / (Path(name).stem + extension)
        if candidate.exists():
            return Image.open(candidate).convert('RGB')
    raise FileNotFoundError(f'{name} not found in {directory}')


def font(size):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main(ours_dir: str, out_dir: str) -> None:
    ours_root, out = Path(ours_dir), Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, ref_file, our_file, caption in PAIRS:
        ref = load(ROOT / 'reference', ref_file)
        mine = load(ours_root, our_file)
        height = min(ref.height, mine.height, 826)  # the recording is 1920 x 826: compare the same window
        half = 960
        scale_ref = half / ref.width
        scale_mine = half / mine.width
        a = ref.crop((0, 0, ref.width, round(height))).resize((half, round(height * scale_ref)))
        b = mine.crop((0, 0, mine.width, round(height * scale_ref / scale_mine))).resize((half, round(height * scale_ref)))
        bar = 44
        sheet = Image.new('RGB', (half * 2 + 6, a.height + bar), (20, 20, 20))
        sheet.paste(a, (0, bar))
        sheet.paste(b, (half + 6, bar))
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 10), f'REFERENCE (eneba.com recording): {caption}', fill=(255, 255, 255), font=font(18))
        draw.text((half + 18, 10), 'KEYMART (ours)', fill=(250, 211, 24), font=font(18))
        sheet.save(out / f'{name}.jpg', quality=88, optimize=True)
        print('wrote', out / f'{name}.jpg')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
