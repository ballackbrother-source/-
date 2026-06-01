#!/usr/bin/env python3
"""Assemble PNG frames into an optimised demo GIF.
Usage: make_gif.py <frames_dir> <out.gif>"""
import sys, os, glob
from PIL import Image

def main():
    frames_dir = sys.argv[1]
    out = sys.argv[2]
    files = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
    if not files:
        print("no frames"); sys.exit(1)

    target_w = 640  # downscale for a reasonable file size
    imgs = []
    for f in files:
        im = Image.open(f).convert("RGB")
        w, h = im.size
        im = im.resize((target_w, int(h * target_w / w)), Image.LANCZOS)
        # adaptive palette per frame -> good colour, then quantise
        imgs.append(im.quantize(colors=128, method=Image.FASTOCTREE))

    imgs[0].save(
        out, save_all=True, append_images=imgs[1:],
        duration=90, loop=0, optimize=True, disposal=2,
    )
    size_kb = os.path.getsize(out) // 1024
    print(f"wrote {out}  ({len(imgs)} frames, {size_kb} KB)")

if __name__ == "__main__":
    main()
