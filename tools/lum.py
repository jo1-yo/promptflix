import sys, os, subprocess, hashlib, json, struct
S = sys.argv[1]; out = {}
urls = [u.strip() for u in open(f"{S}/covers.txt") if u.strip()]
def fetch(u):
    k = hashlib.md5(u.encode()).hexdigest(); p = f"{S}/thumbs/{k}.jpg"; b = f"{S}/thumbs/{k}.bmp"
    if not os.path.exists(p): subprocess.run(["curl", "-s", "-m", "20", "-o", p, u])
    subprocess.run(["sips", "-s", "format", "bmp", "-z", "18", "32", p, "--out", b], capture_output=True)
    return b
from concurrent.futures import ThreadPoolExecutor
paths = list(ThreadPoolExecutor(12).map(fetch, urls))
for u, b in zip(urls, paths):
    try:
        d = open(b, "rb").read(); off = struct.unpack("<I", d[10:14])[0]; w, h = struct.unpack("<ii", d[18:26]); bpp = struct.unpack("<H", d[28:30])[0] // 8
        row = (w * bpp + 3) & ~3; tot = 0
        for y in range(abs(h)):
            for x in range(w):
                i = off + y * row + x * bpp; bl, g, r = d[i], d[i+1], d[i+2]; tot += r * .3 + g * .59 + bl * .11
        out[u] = round(tot / (w * abs(h)))
    except Exception as e: out[u] = -1
json.dump(out, open(f"{S}/creators/lum.json", "w"))
print(len(out), sum(1 for v in out.values() if v < 0), "failed")
