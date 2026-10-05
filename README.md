# Harvard Fencing Club

A small Jekyll site for GitHub Pages. Pages: **Home** (practice times + photo slideshow), **Events**, **Team** (leadership + outreach), **Play** (a browser fencing game), and **Resources** (links + first-practice FAQ).

## Preview locally

Requires Ruby. Once: `gem install jekyll webrick`. Then from this folder:

```
jekyll serve
```

Open http://localhost:4000. Edits rebuild automatically. Refresh to see them.

## Where to edit

- **`content.js`**: practice times/location, slideshow settings, events, leaders, outreach, resource links, FAQs. Most changes happen here.
- **`_config.yml`**: site title/description and the header navigation.
- **`_layouts/default.html`**, **`_includes/header.html`**: shared page shell. Edit once, every page updates.
- **`index.html`, `events.html`, `team.html`, `play.html`, `resources.html`**: each page's headings and structure (front matter sets its title and nav highlight).
- **`styles.css`**: look and layout. **`script.js`**: page behavior. **`game.js`**: the fencing game.

If practice times or contact details change, also update the static fallback text in `index.html`, the FAQ in `content.js`, and the description in `_layouts`/front matter.

## Photos (Google Drive folder)

The home slideshow plays every photo in the club's public Drive folder, in random order on each visit. Only the current and next photos load, so large albums are fine.

After adding photos to the folder, refresh the list and push:

```
python update-photos.py
```

This rewrites `photos.js` (photo IDs only, no image files in the repo). Videos are skipped. The folder must stay shared as **Anyone with the link → Viewer**. The folder link lives at the top of `update-photos.py`. Slideshow speed, autoplay, and shuffle are in `content.js`.

## Team and event photos

- **Leader profile pictures:** put the image in `assets/team/` and set that leader's `photo` in `content.js`, e.g. `photo: "assets/team/adi-raj.jpg"`. They show as circles, and `photoPosition` adjusts the crop.
- **Photos beside Events / under Leadership:** add entries to `eventPhotos` or `teamPhotos` in `content.js`, e.g. `{ src: "assets/photos/big-one.jpg", alt: "Club at the Big One" }`. A Drive file ID also works: `{ driveId: "…", alt: "…" }`.

Empty photo frames appear only in the localhost preview. On the live site the space stays hidden until photos are added.

## The game

`play.html` + `game.js`: You fence the computer. Advance/retreat (A/D or arrows), lunge (Space/J), and parry (K/↓). On-screen buttons appear on touch devices. Four levels: Novice, Intermediate, Club, Olympian. First to 5 wins. A parried attacker is briefly stunned, and the parrier's next lunge is faster (riposte). If both lunges land, the one started first scores. If they start within 50 ms, it's simultaneous and nobody scores. The win/loss record is stored only in the visitor's browser.

## Publish on GitHub Pages

1. Push this folder's contents to a repository root.
2. **Settings → Pages → Deploy from a branch → main → / (root)**. GitHub builds the Jekyll site automatically.

Links are relative, so the site works on a `username.github.io/repo/` subpath without setting `baseurl`.

## Sources

Practice, leaders, contact details, and events came from the club. The [NEIFC event page](https://www.neifc.org/big-one) listed November 1, 2026 at Smith College when checked October 3, 2026. The [Harvard Athletics timeline](https://gocrimson.com/sports/2020/5/5/information-history-traditiontimeline.aspx) is linked as broader Harvard fencing history, not this club's founding.
