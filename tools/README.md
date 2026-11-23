# Creator data pipeline

Regenerates `../creators.js` from the Notion list (six categories, about 20 creators each).

- `data/<category>.json`: YouTube/Vimeo works per creator, each ID checked with oEmbed.
- `xfetch.py OUT.json handle…`: recent video posts from X creators via the public fxtwitter mirror (MP4 + cover + location).
- `data/ytcovers.txt`: which YouTube IDs have a maxres cover (else hqdefault, cropped in CSS).
- `lum.py DIR`: cover brightness (needs `DIR/covers.txt` and `DIR/thumbs/`), so a legible frame leads each card.
- `gen.py data ../creators.js`: merge everything. Hand-picked lead films live in `LEAD`.

```bash
python3 gen.py data ../creators.js
```
