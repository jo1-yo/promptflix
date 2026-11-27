# DESIGN.md

How Rolvo looks and behaves, and why. Read this before changing any UI. The rules for code live in [AGENTS.md](AGENTS.md); this file is the visual system. All of it is implemented in `styles.css` (tokens in `:root`, later labelled blocks override earlier ones) and applies to the client site, the creator site and admin alike.

## Principles

1. **The films are the design.** The interface is quiet so the work can be loud: off-white canvas, ink text, no accent colour, no decoration that competes with a cover.
2. **Say a thing once.** No title bar, label, hint or button that repeats what is already on screen. If a sentence can go, it goes.
3. **Show, don't describe.** Where a choice can be a picture (a category, a style, a film), it is a picture with a name under it, not a row of text.
4. **Never crop a film.** A film is shown at its own width and height. Portrait films are tall, wide films are wide.
5. **Windows, not pages.** Sign-in, questions and gates open in a window over where the visitor already is. A visitor never lands on a page that only says "sign in".
6. **Gentle.** Things ease in and out. Nothing snaps, bounces or flashes.

## Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f7f7f4` | Page canvas |
| `--fg` | `#26251e` | Ink: text, primary buttons, focus rings, markers |
| `--muted` | `#615f56` | Secondary text |
| `--dim` | `#6f6d64` | Tertiary text, placeholders |
| `--line` / `--line2` | `#e6e5e0` / `#cfcdc4` | Hairlines |
| `--raise` / `--raise2` | `#e6e5e0` / `#dcdbd5` | Selected tag, chip, nav item |
| `--ok` `--warn` `--bad` | green, amber, red | Status only, never decoration |

There is no accent colour. Emphasis comes from ink, weight and size. Colour on the page comes from the films.

## Type

Inter (400, 500, 600), loaded from Google Fonts. No serif. Headings are weight 400 with tight tracking (`-.03em`); body is 16px / 1.5.

- Hero h1: `clamp(30px, 3.4vw, 46px)`, line-height 1.08
- Page title (`.pname`): `clamp(34px, 4.2vw, 54px)`
- h2: `clamp(24px, 2.4vw, 30px)`
- Card caption: 15px / 500, with a 13px muted second line
- UI copy is short, plain English. No emoji, no exclamation marks, no marketing filler.

## Layout

- Header, page and footer share one container, so their left and right edges line up at every width: `.wrap` with `padding-inline: var(--edge)`.
- The header is 64px (58px under 900px wide), sticky, with a blurred background once the page scrolls.
- Check every change at 1440 and 375 wide. No horizontal scroll, ever.

## Buttons

Every button is a pill (`border-radius: 999px`). There are two that matter:

| | Class | Look |
|---|---|---|
| **Secondary** | `.btn` | White fill, a 1px ring (`rgba(38,37,30,.08)`) and a soft two-layer shadow, so it reads as an object on the off-white canvas. Hover deepens the ring and the shadow. |
| **Primary** | `.btn.primary` | Ink fill (`--fg`), white label, no ring, no shadow. Hover goes to black. |

- The label is weight 400. Sizes: `.small` 34px, default 40px, `.big` 52px (hero and the main action of a window).
- **White is the default.** Black is for the one action a view exists for (Hire a filmmaker, Pick this film, Continue, Sign in in the header). Gates, prompts and second actions are white. Never two black buttons side by side.
- `.btn.quiet` is for the least important action (cancel, keep it): no fill, no ring, muted label.
- `.btn.danger` is white with a red label and a red ring. Only for ending a contract or failing a review.
- Text links that act (`.link`: "Back", "Show 3 others") are plain muted text, not buttons.
- Google and PayPal buttons are the providers' own and are never restyled.

## Controls

Everything a visitor can press speaks the same language as the buttons.

- **Round controls** (close, add, slide arrows, sound) are white circles with the same ring and shadow as a white button (`--ring`, hover `--ring2`).
- **Nav items, home tags and chips** are pills, label weight 400. A selected chip is ink with a white label; a selected tag or nav item is a soft grey fill.
- **Fields** (`.i`) have a 12px radius. A field that sits in a row with a pill button (chat composer, the reference page) is a pill too.
- **Sign-in** is one column 400px wide: Continue (black) and Google's own button (its white "outline" theme, pill, 40px) are the same width and height. Google's button is drawn by Google and is never restyled or imitated.

## Surfaces

- **Frosted pane.** Cards, sheets, windows and the floating bars are one surface: `background: var(--frost)` plus `backdrop-filter: var(--frost-blur)`, 16px radius, no border. The page behind an open window is blurred.
- **No card inside a card.** Inside a pane, separate things with space or a hairline, never with another bordered box.
- **Film, creator and category cards have no box.** A rounded cover (12px), the caption underneath, nothing on the cover. Hover acts on the cover (a slow 4.5% zoom and a soft shadow), never on the caption.

## The film wall

- Films sit in columns (4, then 3 under 1100px, 2 under 720px) at their own shape. Each film goes to the shortest column, so the order still reads left to right, top to bottom. Code: `gallery()` in `merchant.js`.
- Shapes come from `filmmeta.js`, generated by `tools/filmmeta.py`. About one film in five is not 16:9; those are spread through the list (`stagger()`) so every screen has a mix.
- Covers are stills from the film itself, in HD, picked by the same tool. The uploader's poster thumbnail is used only when every still is poor.
- Hovering a card plays the film muted in place of its cover, at once.
- Signed out, the wall shows twelve films, then fades into a progressive blur with one button: "Sign in to see more".

## Windows

- A window is the sheet panel with `.winp`: a step count top left ("1/2"), one optional text action top right, a question as the h2, then the answers. No title bar, no close row, no lead paragraph.
- **Questions on arrival.** Two questions, each a grid of picture answers (`.qgrid` of `.qcard`: a 4:3 cover and a name), then three rounds of "Pick the closest film." with the playing film in the middle and its neighbours blurred.
- Sign-in is asked for only when there is something to show for it: results, creators, search.

## Navigation

- Header: logo, then Discover (the home page) and Creators; with an account, Orders and Favourites (and Messages once the beta ends and chat opens). Nothing else: a link is in the header only if it opens something.
- What an account adds (Messages, Orders, Favourites) does not exist for a visitor: not in the header, not greyed out.
- **Favourites.** A white Save button with a heart sits in a film's player and on a creator's page; saved, the heart fills red (the one place colour marks state). Both land on the Favourites page: films as a wall, creators under them.
- **Account pages** (Messages, Orders, Favourites) share one head: a 38px title on the left, tags on the right when the page has more than one view. They keep the header's left and right edges.
- **Orders** is a list in two groups, In progress and Finished. A row is the creator's cover, the project and creator, the status with what happens next, the date and the price. Hovering lifts the row to a white surface; it opens the conversation.
- **Favourites** shows one thing at a time, Films or Creators, switched with tags that carry a count.
- **Messages** is two columns inside the page edges: the list (the open row is a white surface) and the conversation as one frosted pane. The order sits at the top of that pane behind a hairline, not in a box. Their messages are white bubbles, yours are ink. The news line is hidden here so the conversation gets the full height.
- A news line sits above the header on the client site (`.newsbar`), for visitors only: one bold statement, one muted fact, one small white button that opens the questions. It scrolls away with the page. With an account it is gone.
- Sections that are not open yet (Use cases, Pricing, Connect to your AI) are not in the header. Each appears the day its page opens.
- **Notices** (`#toast`) are white pills with the ring and shadow, bottom centre. Never a dark slab.
- The hero is for visitors. Once signed in, the home page starts at the search bar and the wall.
- **Search is one floating bar** under the header on the home page: "Start from a video you like". It stays in place while the wall scrolls and opens the reference page, where a link, a file or a sentence all work. It needs an account.
- Home tags: Discover, For you, then one per category. Switching a tag keeps the scroll position.

## Motion

- Windows fade and rise 14px over about half a second with `cubic-bezier(.16, 1, .3, 1)`; closing fades first, then hides.
- Hover changes take 150–350ms. Cover zoom takes 600ms.
- Everything respects `prefers-reduced-motion`: no previews, no typing, no slides.

## Do not

- Add an accent colour, a gradient button, or a second typeface.
- Put text, tags or badges on top of a cover.
- Crop a film to make a grid tidy.
- Add a square or slightly rounded button. Buttons are pills.
- Add a page whose only content is "sign in" or "coming soon" behind a link that looked open.
- Add explanatory copy under a heading that already says it.
