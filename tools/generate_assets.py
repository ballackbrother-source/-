#!/usr/bin/env python3
# ============================================================
#  generate_assets.py
#  Generate "real mecha-SF" sprites with OpenAI gpt-image-2,
#  then chroma-key the green screen to transparent PNGs that
#  NOVA LANCE auto-loads in place of its procedural sprites.
#
#  WHY GREEN SCREEN: gpt-image-2 does not produce transparency,
#  so we ask for a pure chroma-green background and key it out.
#
#  Requirements:
#    - OpenAI API key in env  OPENAI_API_KEY  (sk-proj-...),
#      with billing + Verified Organization (needed for image gen).
#    - pip install pillow
#
#  Usage:
#    export OPENAI_API_KEY=sk-proj-...
#    python3 tools/generate_assets.py            # all sprites + bg
#    python3 tools/generate_assets.py player turret   # only some keys
#
#  After it runs it flips assets/manifest.json "generated": true,
#  so the game loads the PNGs on next launch.
# ============================================================
import os, sys, json, base64, time, io, urllib.request, urllib.error
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")

API_URL = "https://api.openai.com/v1/images/generations"
MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
KEY = os.environ.get("OPENAI_API_KEY", "")

GREEN = "on a solid pure chroma-key green (#00ff00) background, no shadows on the background"
STYLE = ("highly detailed realistic military sci-fi mecha concept art, sharp studio lighting, "
         "metallic panel lines, weathered hull, photoreal rendering, centered, full object in frame, "
         "single object only, no text, no watermark")

# faces RIGHT = player; enemies face LEFT (toward the player)
SPRITES = {
    "player":        f"a sleek single-seat space fighter jet seen from directly above, nose pointing RIGHT, glowing cyan engine and canopy, orange accent stripes, {STYLE}, {GREEN}",
    "option":        f"a small glowing spherical drone orb with a cyan energy core and metal ring, top-down, {STYLE}, {GREEN}",
    "enemyFighter":  f"a hostile angular alien space fighter seen from above, nose pointing LEFT, dark red armor, glowing red sensor eye, {STYLE}, {GREEN}",
    "enemyDrone":    f"a small round armored attack drone, top-down, grey metal with a single glowing orange eye and bolts, {STYLE}, {GREEN}",
    "enemyWeaver":   f"a sleek teal alien interceptor seen from above, nose pointing LEFT, forked twin tail, glowing cyan sensor, {STYLE}, {GREEN}",
    "turret":        f"a ground anti-air gun turret with a domed base and a single barrel pointing up, front view, {STYLE}, {GREEN}",
    "midEnemy":      f"a medium hostile gunship seen from above, nose pointing LEFT, heavy grey armor plates, multiple gun ports, red sensors, {STYLE}, {GREEN}",
    "carrier":       f"a large hostile drone-carrier warship seen from above, nose pointing LEFT, dark purple-grey hull, open drone bays glowing violet, {STYLE}, {GREEN}",
    "missile":       f"a small sleek guided missile pointing RIGHT with a glowing orange exhaust, side view, {STYLE}, {GREEN}",
    "capsule":       f"a glowing orange power-up capsule, faceted gem-like crystal with a metal frame and the letter P, top-down, {STYLE}, {GREEN}",
    "capsuleFake":   f"a glowing red warning power-up capsule, faceted crystal with a metal frame and a question mark, looks dangerous, top-down, {STYLE}, {GREEN}",
}

# backgrounds: LANDSCAPE / SCENERY ONLY — explicitly no mechs, no people, no vehicles
BACKGROUNDS = {
    "bg_stage1": "wide cinematic dawn sky over distant mountains and a calm sea, soft clouds, warm sunrise glow, scenery only, absolutely no people no vehicles no machines, matte painting, 16:9",
    "bg_stage2": "wide cinematic deep-space asteroid field with rocky canyon walls and a faint purple nebula, scenery only, absolutely no people no vehicles no machines, matte painting, 16:9",
    "bg_stage3": "wide cinematic interior of a colossal alien battleship corridor, dark metal walls with glowing orange energy conduits, scenery only, absolutely no people no vehicles no machines, matte painting, 16:9",
}

def call_openai(prompt, size):
    if not KEY:
        raise SystemExit("ERROR: OPENAI_API_KEY not set. export OPENAI_API_KEY=sk-proj-...")
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": size, "n": 1}).encode()
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={
        "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            d = data["data"][0]
            if d.get("b64_json"):
                return base64.b64decode(d["b64_json"])
            # some responses give a url
            with urllib.request.urlopen(d["url"], timeout=120) as r2:
                return r2.read()
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="ignore")
            print(f"  HTTP {e.code}: {msg[:200]}")
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(2 ** (attempt + 1)); continue
            raise
        except Exception as e:
            print(f"  retry ({attempt}): {e}")
            time.sleep(2 ** (attempt + 1))
    raise SystemExit("failed after retries")

def chroma_key(png_bytes, max_dim=256):
    """Remove pure-green background -> transparent, trim, downscale."""
    im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # green-dominant pixel -> transparent
            if g > 110 and g > r * 1.35 and g > b * 1.35:
                px[x, y] = (r, g, b, 0)
            elif g > r and g > b and (g - max(r, b)) > 35:
                # green fringe -> reduce greenish tint, partial alpha
                px[x, y] = (r, min(r, b), b, int(a * 0.5))
    # trim transparent border
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # downscale to game-friendly size
    w, h = im.size
    if max(w, h) > max_dim:
        s = max_dim / max(w, h)
        im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    out = io.BytesIO(); im.save(out, "PNG")
    return out.getvalue()

def main():
    os.makedirs(ASSETS, exist_ok=True)
    which = sys.argv[1:]
    sprites = {k: v for k, v in SPRITES.items() if not which or k in which}
    bgs = {k: v for k, v in BACKGROUNDS.items() if (not which or k in which)}

    with open(MANIFEST) as f:
        manifest = json.load(f)

    for key, prompt in sprites.items():
        fname = manifest["sprites"].get(key, key + ".png")
        print(f"[sprite] {key} -> {fname}")
        raw = call_openai(prompt, "1024x1024")
        keyed = chroma_key(raw)
        with open(os.path.join(ASSETS, fname), "wb") as f:
            f.write(keyed)

    for key, prompt in bgs.items():
        fname = key + ".png"
        print(f"[bg] {key} -> {fname}")
        raw = call_openai(prompt, "1536x1024")
        with open(os.path.join(ASSETS, fname), "wb") as f:
            f.write(raw)
        manifest.setdefault("backgrounds", {})[key] = fname

    manifest["generated"] = True
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
    print("done. manifest.generated = true — relaunch the game to see the AI art.")

if __name__ == "__main__":
    main()
