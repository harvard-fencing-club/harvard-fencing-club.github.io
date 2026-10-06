# Harvard Fencing Club 

**Open to everyone!** We're a student fencing club at Harvard that welcomes fencers of every level in all three weapons.

**Website:** [harvard-fencing-club.github.io](https://harvard-fencing-club.github.io)

## Practice with us

| When | Time |
|---|---|
| Tuesday | 7:30–9:30 PM |
| Thursday | 7–10 PM (Crimson Club Open Bouting) |
| Sunday | 10:30 AM–12:30 PM |

**Malkin Athletic Center (MAC), Fencing Room 1, 3rd floor**, Cambridge, MA ([map](https://www.google.com/maps/search/?api=1&query=Malkin+Athletic+Center%2C+39+Holyoke+St%2C+Cambridge%2C+MA))

New to fencing? Just show up to a Tuesday or Sunday practice. We provide all the equipment and teach you everything you need.

## Who can join

Students from every Harvard school, MIT, and other colleges in the area are welcome. If you don't have a Harvard athletics membership, we'll sign you in at the front desk.

## Get in touch

- **WhatsApp:** [Join our group](https://chat.whatsapp.com/L9N5Ad1ajsz0t6oA2TtgGX)
- **Email:** [harvardfencingclub@gmail.com](mailto:harvardfencingclub@gmail.com)
- **Instagram:** [@theharvardfencingclub](https://www.instagram.com/theharvardfencingclub/)
- **Harvard SoCo:** [Our student organization page](https://soco.college.harvard.edu/257861/home/)

## What's on the website

- **Home:** the weekly practice schedule, a live "next practice" reminder, and a slideshow of photos from the club.
- **Events:** competitions like the NEIFC Big One, plus weekly open bouting with the Crimson Club.
- **People:** meet our club leaders and find out how to reach us.
- **Gallery:** browse club photos grouped into collections (bursts of similar shots), and open any one full screen to flip through the similar shots.
- **Play:** a sabre, foil, or épée bout you can play in your browser, scored with each weapon's real rules (right of way, off-target touches, doubles). Advance, retreat, lunge, and parry your way to five touches against the computer, from Novice up to Olympian.
- **Donate:** how alumni and friends can support the club through Harvard's giving portal or by check.
- **Resources:** our favorite fencing videos, competition sites, and answers to common questions.

## Leadership

- **Adi Raj**, Captain
- **Tatum Mueller**, Captain
- **Dafne Unsal Nuchi**, Executive
- **Ziva Benedejcic**, Executive

---

<details>
<summary><strong>For club officers: updating the website</strong></summary>

The site is built with [Jekyll](https://jekyllrb.com/) and published automatically by GitHub Pages whenever changes are pushed to `main`.

| To change… | Edit |
|---|---|
| Practice times, events, leaders, links, FAQs, contact info | `assets/js/content.js` (most edits happen here) |
| Front-page and gallery photos | links + picks at the top of `tools/update-photos.py`, then run `python tools/update-photos.py` and push the new `assets/js/photos.js` (needs `pip install pillow`) |
| Leader portraits, event/group photos | add the image to `assets/images/team/` or `assets/images/photos/`, then list it in `content.js` |
| Menu (page names and order) | `_config.yml` |
| Header, footer, page shell | `_includes/header.html`, `_includes/footer.html`, `_layouts/default.html` |
| Look and layout | `assets/css/site.css` |
| A page's headings and structure | the page's own file (`index.html`, `events.html`, `people.html`, …) |

**How the code is organised:** `assets/js/site.js` runs on every page (menu, dark mode, contact links). Each page then loads its own small script, listed in the page's front matter (`scripts: [home]` loads `assets/js/home.js`): `home.js`, `events.js`, `people.js`, `gallery.js`, `resources.js`, `game.js`.

**Preview locally:** install Ruby, run `gem install jekyll webrick` once, then `jekyll serve` and open http://localhost:4000.

If practice times or contact details change, also update the backup text in `index.html` and the FAQ in `content.js`.

</details>
