#!/usr/bin/env python3
"""Builds filmmeta.js: each film's real shape and, for YouTube, which still to use as its cover.

    python3 tools/filmmeta.py            (needs Pillow and numpy; re-run after creators.js changes)

Shape. The film's own width and height, never trimmed: YouTube reports it (oEmbed), except for Shorts, which it reports
as 16:9, so a film that answers at /shorts/<id> counts as 9:16. Vimeo's still has the film's shape; X carries it in the
file URL. A film letterboxed inside a 16:9 upload stays 16:9, bars and all: the wall shows the file as it was uploaded.

Cover. YouTube keeps three HD frames of every film (25%, 50%, 75% in) next to the uploader's thumbnail. The thumbnail is
often a poster with a title on it; the wall wants the film itself. Each frame is scored on contrast, colour and
sharpness, dark or near-empty frames are marked down, and the best one wins. The uploader's thumbnail is kept only when
all three frames are poor. Nothing is downloaded into the repo: the file only names which of YouTube's stills to load.

Output: const FILM_META = { "<film key>": [width / height, "<still name>" or 0] }. A film that is 16:9 and keeps its
cover is left out. ui.js reads it in filmRatio() and cover().
"""
import concurrent.futures as cf, hashlib, io, json, os, re, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(tempfile.gettempdir(), "rolvo-filmmeta")
os.makedirs(CACHE, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0"}


def fetch(url):
    """Bytes of url, cached on disk; None when it does not exist."""
    p = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(p):
        b = open(p, "rb").read()
        return b or None
    try:
        b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read()
    except Exception:
        b = b""
    open(p, "wb").write(b)
    return b or None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def is_short(yt):
    """YouTube serves /shorts/<id> for a Short and redirects it to /watch for anything else."""
    p = os.path.join(CACHE, "short-" + yt)
    if os.path.exists(p):
        return open(p).read() == "1"
    try:
        r = urllib.request.build_opener(NoRedirect).open(urllib.request.Request("https://www.youtube.com/shorts/" + yt, headers=UA), timeout=25)
        v = r.status == 200
    except urllib.error.HTTPError as e:
        if e.code not in (301, 302, 303, 307, 308):
            return False   # not cached: ask again next run
        v = False
    except Exception:
        return False
    open(p, "w").write("1" if v else "0")
    return v


def image(url):
    b = fetch(url)
    if not b:
        return None
    try:
        return Image.open(io.BytesIO(b)).convert("RGB")
    except Exception:
        return None


def bars(img):
    """Black bars as fractions (top, bottom, left, right)."""
    g = np.asarray(img.convert("L").resize((320, 180)), dtype=np.float32)

    def run(lines):
        n = 0
        for line in lines:
            if line.mean() < 18 and line.std() < 7:
                n += 1
            else:
                break
        return n

    return (run(g) / 180, run(g[::-1]) / 180, run(g.T) / 320, run(g.T[::-1]) / 320)


def score(img, box):
    """How good a cover this frame makes, 0..1. box = (top, bottom, left, right) bars to ignore."""
    w, h = img.size
    t, b, l, r = box
    im = img.crop((int(l * w), int(t * h), int(w - r * w), int(h - b * h))).resize((256, 144))
    a = np.asarray(im, dtype=np.float32)
    g = a.mean(axis=2)
    lum = g.mean()
    contrast = min(g.std() / 64, 1)
    rg, yb = a[..., 0] - a[..., 1], (a[..., 0] + a[..., 1]) / 2 - a[..., 2]
    colour = min((np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean())) / 70, 1)
    lap = g[1:-1, 1:-1] * 4 - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    sharp = min(np.log1p(lap.var()) / 7, 1)
    q = (a // 32).astype(np.int32)
    flat = np.bincount((q[..., 0] * 64 + q[..., 1] * 8 + q[..., 2]).ravel(), minlength=512).max() / g.size   # one colour filling the frame: a title card or a logo
    s = 0.34 * contrast + 0.33 * colour + 0.33 * sharp
    if lum < 48:
        s *= max(lum / 48, 0.15)
    if lum > 218:
        s *= 0.6
    if flat > 0.4:
        s *= max(1 - (flat - 0.4) * 1.6, 0.2)
    return float(s)


def oembed(url):
    b = fetch(url)
    try:
        return json.loads(b) if b else None
    except Exception:
        return None


def one(m):
    key = m.get("yt") or m.get("vm") or m.get("mp4") or m.get("link")
    ratio, still = 16 / 9, 0
    if m.get("yt"):
        yt = m["yt"]
        d = oembed("https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote("https://www.youtube.com/watch?v=" + yt))
        if d and d.get("height"):
            ratio = d["width"] / d["height"]
        frames = [(n, image(f"https://i.ytimg.com/vi/{yt}/{n}.jpg")) for n in ("maxres1", "maxres2", "maxres3")]
        frames = [(n, im) for n, im in frames if im]
        if not frames:   # no HD stills: the 640-wide ones, which carry 4:3 bars of their own
            frames = [(n, im) for n, im in ((n, image(f"https://i.ytimg.com/vi/{yt}/{n}.jpg")) for n in ("sd1", "sd2", "sd3")) if im]
        short = is_short(yt)
        if short:
            ratio = 9 / 16
        if frames:
            if short:   # a Short's stills are 16:9 with the picture in the middle
                box = (0, 0, 0.342, 0.342)
            else:
                bs = [bars(im) for _, im in frames]
                box = tuple(min(b[i] for b in bs) for i in range(4))   # a real bar is in every frame; a dark scene is not. Used for scoring only, never for the shape.
            scored = sorted(((score(im, box), n) for n, im in frames), reverse=True)
            if scored[0][0] >= 0.3 and frames[0][0].startswith("maxres"):
                still = scored[0][1]
            elif not image(f"https://i.ytimg.com/vi/{yt}/maxresdefault.jpg") and scored[0][0] >= 0.3:
                still = scored[0][1]
    elif m.get("vm"):
        d = oembed("https://vimeo.com/api/oembed.json?url=" + urllib.parse.quote("https://vimeo.com/" + m["vm"]))
        if d and d.get("height"):
            ratio = d["width"] / d["height"]
        im = image(re.sub(r"-d_\d+x\d+", "-d_640", m.get("cover", "")))   # at its natural shape, which is the picture's
        if im:
            ratio = im.size[0] / im.size[1]
    elif m.get("mp4"):
        x = re.search(r"/(\d{3,4})x(\d{3,4})/", m["mp4"])
        if x:
            ratio = int(x.group(1)) / int(x.group(2))
    ratio = round(min(2.4, max(0.5, ratio)), 2)
    if abs(ratio - 16 / 9) < 0.04:
        ratio = 1.78
    return key, ratio, still


def main():
    works = json.loads(subprocess.check_output(["node", "-e",
        "const fs=require('fs');const C=new Function(fs.readFileSync(process.argv[1],'utf8')+';return CREATORS;')();"
        "console.log(JSON.stringify(C.flatMap(c=>c.works.map(w=>w[5])).filter(Boolean)))", os.path.join(ROOT, "creators.js")]))
    out = {}
    with cf.ThreadPoolExecutor(12) as ex:
        for i, (key, ratio, still) in enumerate(ex.map(one, works)):
            if key and (ratio != 1.78 or still):
                out[key] = [ratio, still]
            if i % 100 == 0:
                print(f"{i}/{len(works)}", file=sys.stderr)
    body = json.dumps(dict(sorted(out.items())), separators=(",", ":"))
    with open(os.path.join(ROOT, "filmmeta.js"), "w") as f:
        f.write(f"/* Generated by tools/filmmeta.py: the shape and the cover still of {len(out)} films. Regenerate, don't hand-edit. */\nconst FILM_META = {body};\n")
    shapes = sum(1 for v in out.values() if v[0] != 1.78)
    print(f"films {len(works)}, written {len(out)}, not 16:9: {shapes}, cover from a frame: {sum(1 for v in out.values() if v[1])}")


if __name__ == "__main__":
    main()
