from PIL import Image
from pathlib import Path

import sys

# Uso: python scripts/crop-faces.py <caminho-da-arte-com-os-rostos.png>
src = Path(sys.argv[1] if len(sys.argv) > 1 else "assets/faces-source.png")
img = Image.open(src).convert("RGBA")
W, H = img.size
cw, ch = W // 3, H // 2
out = Path(__file__).resolve().parents[1] / "faces"
out.mkdir(parents=True, exist_ok=True)


def square_resize(im):
    fw, fh = im.size
    side = min(fw, fh)
    left = (fw - side) // 2
    top = max(0, (fh - side) // 2 - int(side * 0.02))
    face = im.crop((left, top, left + side, top + side))
    return face.resize((256, 256), Image.Resampling.NEAREST)


def cell(r, c):
    return img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))


# Top row: head only (cut before grey label bar)
faces = {
    "natan": cell(0, 0).crop((28, 12, cw - 28, int(ch * 0.58))),
    "arctic": cell(0, 1).crop((28, 12, cw - 28, int(ch * 0.58))),
    "jorge": cell(0, 2).crop((28, 12, cw - 28, int(ch * 0.58))),
}

# Bottom-middle cell stacks Caio (top) + Lorenzo (bottom); cut labels out
mid = cell(1, 1)
mh = mid.height
faces["caio"] = mid.crop((28, 6, cw - 28, int(mh * 0.40)))
faces["lorenzo"] = mid.crop((28, int(mh * 0.52), cw - 28, int(mh * 0.88)))

for name, im in faces.items():
    face = square_resize(im)
    path = out / f"{name}.png"
    face.save(path)
    print(f"saved {path}")

strip = Image.new("RGBA", (256 * 5, 256), (0, 0, 0, 255))
for i, name in enumerate(["natan", "arctic", "jorge", "caio", "lorenzo"]):
    strip.paste(Image.open(out / f"{name}.png"), (i * 256, 0))
strip.save(out / "_preview.png")
print("preview ok")
