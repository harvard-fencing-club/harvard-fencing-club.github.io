# Harvard Fencing Club ⚔️

**Open to everyone!** We're a student fencing club at Harvard that welcomes fencers of every level, from people who have never held a blade to experienced competitors, in all three weapons: foil, épée, and sabre.

🌐 **Website:** [harvard-fencing-club.github.io](https://harvard-fencing-club.github.io)

## Practice with us

| When | Time |
|---|---|
| Tuesday | 7:30–9:30 PM |
| Thursday | 7–10 PM (Crimson Club Open Bouting) |
| Sunday | 10:30 AM–12:30 PM |

📍 **Malkin Athletic Center (MAC), Fencing Room 1, 3rd floor**, Cambridge, MA ([map](https://www.google.com/maps/search/?api=1&query=Malkin+Athletic+Center%2C+39+Holyoke+St%2C+Cambridge%2C+MA))

New to fencing? Just show up to a Tuesday or Sunday practice. We provide all the equipment and teach you everything you need.

## Who can join

Students from every Harvard school, MIT, and other colleges in the area are welcome. If you don't have a Harvard athletics membership, we'll sign you in at the front desk.

## Get in touch

- 💬 **WhatsApp:** [Join our group](https://chat.whatsapp.com/L9N5Ad1ajsz0t6oA2TtgGX)
- ✉️ **Email:** [harvardfencingclub@gmail.com](mailto:harvardfencingclub@gmail.com)
- 📷 **Instagram:** [@theharvardfencingclub](https://www.instagram.com/theharvardfencingclub/)
- 🎓 **Harvard SoCo:** [Our student organization page](https://soco.college.harvard.edu/257861/home/)

## What's on the website

- **Home:** the weekly practice schedule, a live "next practice" reminder, and a slideshow of photos from the club.
- **Events:** competitions like the NEIFC Big One, plus weekly open bouting with the Crimson Club.
- **Team:** meet our club leaders and find out how to reach us.
- **Play:** a fencing game you can play in your browser. Advance, retreat, lunge, and parry your way to five touches against the computer, from Novice up to Olympian.
- **Resources:** our favorite fencing videos, competition sites, and answers to common questions.

## Leadership

- **Adi Raj**, President
- **Tatum Mueller**, President
- **Dafne Unsal Nuchi**, Executive
- **Ziva Benedejcic**, Executive

---

<details>
<summary><strong>For club officers: updating the website</strong></summary>

The site is built with [Jekyll](https://jekyllrb.com/) and published automatically by GitHub Pages whenever changes are pushed to `main`.

- **Most details** (practice times, events, leaders, links, FAQs, photos) live in `content.js`.
- **Look and layout:** `styles.css`. **Page behavior:** `script.js`. **The game:** `game.js`.
- **Shared header and navigation:** `_includes/header.html`, `_layouts/default.html`, and `_config.yml`.
- **Home slideshow photos** come from the club's public Google Drive folder. After adding photos there, run `python update-photos.py` and push the updated `photos.js`.
- **Leader and group photos** go in `assets/team/` and `assets/photos/`, then get listed in `content.js`.
- **Preview locally:** install Ruby, run `gem install jekyll webrick` once, then `jekyll serve` and open http://localhost:4000.

If practice times or contact details change, also update the backup text in `index.html` and the FAQ in `content.js`.

</details>
