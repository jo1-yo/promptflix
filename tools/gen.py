import json, re, sys, unicodedata
D = sys.argv[1]; OUT = sys.argv[2]
yt = json.load(open(f"{D}/x.json")); yt2 = json.load(open(f"{D}/x2.json"))
X = {**yt, **{k: v for k, v in yt2.items() if v.get("works")}}
maxres = dict(l.split() for l in open(f"{D}/ytcovers.txt"))   # video id -> HTTP status of maxresdefault.jpg (1280x720)
import os
SD = set(open(f"{D}/ytsd.txt").read().split()) if os.path.exists(f"{D}/ytsd.txt") else set()   # no maxres, but sddefault.jpg (640x480) exists
def ytcover(i): return f"https://i.ytimg.com/vi/{i}/" + ("maxresdefault.jpg" if maxres.get(i) == "200" else "sddefault.jpg" if i in SD else "hqdefault.jpg")
import os
LUM = json.load(open(f"{D}/lum.json")) if os.path.exists(f"{D}/lum.json") else {}
LEAD = {"thedorbrothers": "White Flag"}   # hand-picked lead films (e.g. avoid a political deepfake as a marketplace cover)

# category group -> (cats, styles, est price range, typical days)
GROUP = {
  "narrative":    (["film"],          ["cinematic", "noir", "story"],  [3000, 8000], 14),
  "animation":    (["anim"],          ["anime", "story", "explainer"], [2000, 6000], 14),
  "experimental": (["mv", "film"],    ["surreal", "stream", "cinematic"], [1500, 5000], 10),
  "brand":        (["biz"],           ["story", "hero", "cinematic"],  [3000, 10000], 10),
  "fashion":      (["biz"],           ["hero", "stream", "surreal"],   [2000, 6000], 10),
  "ugc":          (["reels", "biz"],  ["ugc", "hook", "trend"],        [300, 1500], 4),
}
TZ = [  # location keyword -> (display, tz, region)
  ("Port Harcourt", "Port Harcourt", "UTC+1", "emea"), ("Ikorudu", "Lagos", "UTC+1", "emea"), ("Nigeria", "Nigeria", "UTC+1", "emea"),
  ("Netherlands", "Netherlands", "UTC+1", "emea"), ("Amsterdam", "Amsterdam", "UTC+1", "emea"), ("Berlin", "Berlin", "UTC+1", "emea"),
  ("Stockholm", "Stockholm", "UTC+1", "emea"), ("Barcelona", "Barcelona", "UTC+1", "emea"), ("London", "London", "UTC+0", "emea"),
  ("Estonia", "Estonia", "UTC+2", "emea"), ("Muscat", "Muscat", "UTC+4", "emea"),
  ("Tokyo", "Tokyo", "UTC+9", "apac"), ("Singapore", "Singapore", "UTC+8", "apac"),
  ("San Francisco", "San Francisco", "UTC-8", "americas"), ("Los Angeles", "Los Angeles", "UTC-8", "americas"), ("Seattle", "Seattle", "UTC-8", "americas"),
  ("Orlando", "Orlando", "UTC-5", "americas"), ("Palm Beach", "Palm Beach", "UTC-5", "americas"),
  ("Montreal", "Montréal", "UTC-5", "americas"), ("Toronto", "Toronto", "UTC-5", "americas"),
]
def place(*locs):
    for loc in locs:
        if not loc: continue
        for k, disp, tz, reg in TZ:
            if k.lower() in loc.lower(): return disp, tz, reg
    return None, None, None
def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:28] or "creator"
def handle_of(url):
    return url.rstrip("/").split("/")[-1]
def xtitle(t):
    for line in (t or "").split("\n"):
        line = re.sub(r"#\w+", "", line).strip(" .:-—")
        if len(line) >= 4: return (line[:68] + "…") if len(line) > 70 else line
    return "Post on X"

FEATURED = ["The Dor Brothers", "PJ Accetturo / PJ Ace", "Paul Trillo", "Dave Clark", "Shy Kids", "Niceaunties", "Billy Boman", "Junie Lau",
            "Henry Daubrez", "Vallée Duhamel", "Stijn Feijen", "László Gaál", "Charming Computer", "Sasha Kasiuha", "Silverside AI", "Aiden Guo"]
creators, discovered = [], []
for group in ["brand", "narrative", "experimental", "animation", "fashion", "ugc"]:
    cats, styles, est, days = GROUP[group]
    for c in json.load(open(f"{D}/{group}.json")):
        social = c["social"]; h = handle_of(social); src = "X" if "x.com" in social else ("LinkedIn" if "linkedin" in social else "Instagram")
        works = []
        for w in (c.get("works") or [])[:3]:
            cover = ytcover(w["id"]) if w["provider"] == "youtube" else w.get("thumb")   # Vimeo: thumbnail_url from oEmbed
            m = {"cover": cover, "lb": not cover.endswith("maxresdefault.jpg") if cover and "ytimg" in cover else False, "link": f"https://www.youtube.com/watch?v={w['id']}" if w["provider"] == "youtube" else f"https://vimeo.com/{w['id']}", "on": "YouTube" if w["provider"] == "youtube" else "Vimeo", "by": w["author"]}
            m["yt" if w["provider"] == "youtube" else "vm"] = w["id"]
            works.append([w["title"], cats[0], styles[0], None, None, m])
        xr = X.get(h) if src == "X" else None
        if xr and len(works) < 3:
            seen, xs = set(), []
            for w in sorted([w for w in xr.get("works", []) if w.get("mp4") and w.get("thumb") and w["secs"] >= 8], key=lambda w: -(w.get("views") or 0)):
                k = (xtitle(w["text"]), w["secs"])
                if k in seen or w["thumb"] in seen: continue
                seen.update([k, w["thumb"]]); xs.append(w)
            for w in xs[: 3 - len(works)]:
                works.append([xtitle(w["text"]), cats[0], styles[0], w["secs"], None,
                              {"cover": w["thumb"], "mp4": w["mp4"], "link": w["status"], "on": "X", "by": "@" + h}])
        # lead with a legible cover: a pinned title, else the first reasonably bright one, else the brightest
        if works:
            pin = [w for w in works if w[0] == LEAD.get(h)]
            bright = [w for w in works if LUM.get(w[5]["cover"], 99) >= 50]
            lead = (pin or bright or sorted(works, key=lambda w: -LUM.get(w[5]["cover"], 0)))[0]
            works = [lead] + [w for w in works if w is not lead]
        where, tz, region = place(c.get("based"), (xr or {}).get("location"))
        base = {"name": c["name"].split(" / ")[0] if group != "ugc" else c["name"].split(" / ")[0], "handle": h, "source": src, "social": social, "focus": c["focus"]}
        # No embeddable film found (mostly Instagram-only people): still listed, with a monogram card and a link to their own page.
        creators.append({"id": "r_" + slug(h), "handle": h, "real": True, "claimed": False, "live": True, "email": None,
            "name": c["name"], "where": where or "", "tz": tz, "region": region, "source": src, "social": social,
            "bg": c["focus"][:1].upper() + c["focus"][1:] + ".", "tools": [], "cats": cats, "styles": styles, "fit": [],
            "ask": None, "closes": [], "est": est, "days": days, "rating": 0, "done": 0, "works": works,
            "avatar": (xr or {}).get("avatar") or None, "featured": c["name"] in FEATURED})
# Second list: 300 freelancers from the outreach sheet (6 kinds x 50). Works and covers were scraped from each person's own portfolio page.
OUTREACH = {  # sheet category prefix -> (cats, styles, est, days)
  "Product demo": (["biz"], ["demo", "explainer", "hero"], [1000, 5000], 10),
  "短剧":          (["duanju"], ["story", "hook", "cinematic"], [2000, 8000], 14),
  "影游":          (["interactive"], ["story", "cinematic", "noir"], [3000, 10000], 21),
  "UGC":          (["reels", "biz"], ["ugc", "hook", "trend"], [300, 1500], 4),
  "AI film":      (["film"], ["cinematic", "noir", "story"], [3000, 8000], 14),
  "Ads":          (["biz"], ["story", "hero", "cinematic"], [3000, 10000], 10),
}
TZ += [("USA", "", "UTC-5", "americas"), ("California", "", "UTC-8", "americas"), ("New York", "", "UTC-5", "americas"), ("Canada", "", "UTC-5", "americas"), ("UK", "", "UTC+0", "emea"),
       ("Ukraine", "", "UTC+2", "emea"), ("Poland", "", "UTC+1", "emea"), ("Germany", "", "UTC+1", "emea"), ("France", "", "UTC+1", "emea"), ("Spain", "", "UTC+1", "emea"), ("Italy", "", "UTC+1", "emea"),
       ("India", "", "UTC+5:30", "apac"), ("Australia", "", "UTC+10", "apac"), ("China", "", "UTC+8", "apac"), ("Japan", "", "UTC+9", "apac"), ("Brazil", "", "UTC-3", "americas")]
have = {c["name"].lower() for c in creators}; ids = {c["id"] for c in creators}
if os.path.exists(f"{D}/outreach300.json"):
    for o in json.load(open(f"{D}/outreach300.json")):
        cats, styles, est, days = next(v for k, v in OUTREACH.items() if o["cat"].startswith(k))
        name = re.sub(r"\s*\(.*?\)\s*$", "", o["name"]).strip() or o["name"]
        if name.lower() in have: continue
        cid = "r_" + slug(name)
        while cid in ids: cid += "x"
        ids.add(cid); have.add(name.lower())
        works = []
        for w in o["works"][:3]:
            yt = w["provider"] == "youtube"
            m = {"cover": ytcover(w["id"]) if yt else w.get("thumb"), "lb": yt and maxres.get(w["id"]) != "200", "link": f"https://www.youtube.com/watch?v={w['id']}" if yt else f"https://vimeo.com/{w['id']}", "on": "YouTube" if yt else "Vimeo", "by": w["author"]}
            m["yt" if yt else "vm"] = w["id"]
            works.append([w["title"], cats[0], styles[0], None, None, m])
        for u in (o.get("clips") or [])[: 3 - len(works)]:   # clips hosted on the creator's Steam store page
            works.append(["Clip from the Steam page", cats[0], styles[0], None, None, {"cover": o.get("cover"), "mp4": u, "link": o["site"], "on": "Steam", "by": name}])
        loc = o["loc"] or ""
        _, tz, region = place(loc)
        where = "" if re.search(r"not stated|^remote", loc, re.I) else re.sub(r"\s*\(.*?\)", "", loc)
        focus = (o["focus"] or "").strip().rstrip(".")
        creators.append({"id": cid, "handle": slug(name), "real": True, "claimed": False, "live": True, "email": None,
            "name": name, "where": where, "tz": tz, "region": region, "source": "Portfolio", "social": o["site"],
            "bg": (focus[:1].upper() + focus[1:] + ".") if focus else "", "tools": [], "cats": cats, "styles": styles, "fit": [],
            "ask": None, "closes": [], "est": est, "days": days, "rating": 0, "done": 0, "works": works,
            "cover": None if works else o.get("cover"), "avatar": None, "featured": False})
# featured first (in FEATURED order), then round-robin by category so every page mixes kinds of work
feat = sorted([c for c in creators if c["featured"]], key=lambda c: FEATURED.index(c["name"]))
def mix(cs):
    buckets, rr = {}, []
    for c in cs: buckets.setdefault(c["cats"][0], []).append(c)
    while any(buckets.values()):
        for k in list(buckets):
            if buckets[k]: rr.append(buckets[k].pop(0))
    return rr
rest = [c for c in creators if not c["featured"]]
ordered = feat + mix([c for c in rest if c["works"]]) + mix([c for c in rest if not c["works"] and c.get("cover")]) + mix([c for c in rest if not c["works"] and not c.get("cover")])   # films lead, then a cover from their site, then monograms
for c in ordered: c.pop("featured")
js = ("/* Real creators, generated from Jane's Notion list (Filmmaker Platform).\n"
      "   Each work was verified on YouTube (oEmbed) or pulled from the creator's own X posts; creators with no embeddable film have `works: []`. None of these people has joined Rolvo:\n"
      "   `claimed:false` profiles show an *estimated* range from the category (`est`), never a price they quoted. Regenerate rather than hand-edit. */\n"
      "const CREATORS = " + json.dumps(ordered, ensure_ascii=False, indent=0).replace("\n", "") + ";\n"
      "const DISCOVERED = " + json.dumps(discovered, ensure_ascii=False) + ";\n")
js = js.replace("}, {", "},\n{")
open(OUT, "w").write(js)
print(len(ordered), "creators;", sum(len(c["works"]) for c in ordered), "works;", sum(1 for c in ordered if not c["works"]), "listed without a film")
from collections import Counter
print(Counter(c["cats"][0] for c in ordered), Counter(w[5]["on"] for c in ordered for w in c["works"]), sum(1 for c in ordered if c["tz"]), "with tz")
