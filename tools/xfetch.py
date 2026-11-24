import json, sys, urllib.request, re, time
handles = sys.argv[2:]; out = {}
def get(u):
    import subprocess
    for i in range(4):
        try:
            d = json.loads(subprocess.run(["curl","-s","-m","20","-A","rolvo-prototype/0.1",u],capture_output=True,text=True).stdout)
            if d.get("code") == 200 and (d.get("user") or d.get("results")): return d
        except Exception: pass
        time.sleep(3 * (i + 1))
    return d
for h in handles:
    rec = {"handle": h, "works": []}
    try:
        u = get(f"https://api.fxtwitter.com/{h}")["user"]
        rec.update(name=u.get("name"), location=u.get("location"), followers=u.get("followers"), bio=u.get("description"), avatar=(u.get("avatar_url") or "").replace("_normal", "_400x400"))
        cursor = None
        for page in range(3):
            d = get(f"https://api.fxtwitter.com/2/profile/{h}/statuses" + (f"?cursor={cursor}" if cursor else ""))
            for s in d.get("results", []):
                if s.get("retweet") or (s.get("author") or {}).get("screen_name", "").lower() != h.lower(): continue
                vids = [m for m in ((s.get("media") or {}).get("videos") or []) if m.get("type") == "video" and (m.get("duration") or 0) >= 5]
                if not vids: continue
                v = vids[0]; mp4s = sorted([f for f in v.get("formats", []) if f.get("container") == "mp4"], key=lambda f: f.get("bitrate", 0))
                mid = [f for f in mp4s if 600000 <= f.get("bitrate", 0) <= 2500000] or mp4s
                text = re.sub(r"https?://\S+", "", s.get("text") or "").strip()
                rec["works"].append({"status": s["url"], "text": text[:280], "thumb": v.get("thumbnail_url"), "mp4": (mid[-1] if mid else {}).get("url") or v.get("url"), "secs": round(v.get("duration") or 0), "w": v.get("width"), "h": v.get("height"), "likes": s.get("likes"), "views": s.get("views")})
            cursor = (d.get("cursor") or {}).get("bottom")
            if len(rec["works"]) >= 8 or not cursor: break
            time.sleep(0.4)
    except Exception as e:
        rec["error"] = str(e)
    out[h] = rec; time.sleep(2); print(h, len(rec["works"]), rec.get("location"), rec.get("error", ""), file=sys.stderr)
json.dump(out, open(sys.argv[1], "w"), indent=1)
