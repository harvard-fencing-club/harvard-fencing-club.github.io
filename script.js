(() => {
  "use strict";
  const content = window.CLUB_CONTENT;
  if (!content) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const make = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
  const safeUrl = (value, fallback = "") => {
    if (!value) return fallback;
    try { return ["https:", "http:", "mailto:"].includes(new URL(value, document.baseURI).protocol) ? value : fallback; }
    catch { return fallback; }
  };
  const email = (subject = "", body = "") => `mailto:${content.email}${subject ? `?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}` : ""}`;
  const external = link => { link.target = "_blank"; link.rel = "noopener noreferrer"; return link; };
  const arrowIcon = () => { const span = make("span", { className: "arrow" }); span.setAttribute("aria-hidden", "true"); span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 17 17 7M8 7h9v9"/></svg>'; return span; };

  // ---------- Shared: contact links and navigation ----------
  const emailLinks = {
    check: email("Donating to Harvard Fencing Club by check", "Hi Harvard Fencing Club!\n\nI’d like to donate by check. Where should I send it?\n\nThanks!"),
    "first-practice": email("My first fencing practice", "Hi Harvard Fencing Club!\n\nI’d like to come to a practice. My fencing experience is: \n\nCould you confirm any schedule changes and what I should bring?\n\nThanks!"),
    outreach: email("Collaborating with Harvard Fencing Club", "Hi Harvard Fencing Club!\n\nI’m reaching out from: \n\nI’d love to talk about: \n\nThanks!")
  };
  document.querySelectorAll("[data-email]").forEach(link => link.href = emailLinks[link.dataset.email] || email());
  const handle = content.instagram.replace(/^@/, "");
  document.querySelectorAll("[data-instagram]").forEach(link => link.href = `https://www.instagram.com/${encodeURIComponent(handle)}/`);
  document.querySelectorAll("[data-soco]").forEach(link => link.href = safeUrl(content.socoUrl, link.href));
  document.querySelectorAll("[data-whatsapp]").forEach(link => link.href = safeUrl(content.whatsapp, link.href));
  document.querySelectorAll("[data-donate]").forEach(link => link.href = safeUrl(content.donateUrl, link.href));

  const menuButton = $(".menu-toggle"), nav = $("#main-nav");
  const setMenu = open => { menuButton.setAttribute("aria-expanded", String(open)); menuButton.setAttribute("aria-label", `${open ? "Close" : "Open"} navigation`); nav.classList.toggle("is-open", open); };
  menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") { setMenu(false); menuButton.focus(); } });
  document.addEventListener("click", event => { if (!event.target.closest(".site-header")) setMenu(false); });
  window.matchMedia("(min-width: 961px)").addEventListener("change", event => { if (event.matches) setMenu(false); });

  // ---------- Light / dark mode (the lunging-fencer logo is the switch) ----------
  const themeButton = $(".theme-toggle");
  const currentTheme = () => document.documentElement.dataset.theme || "light";
  const syncThemeButton = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    themeButton.setAttribute("aria-label", `Switch to ${next} mode`);
    themeButton.title = `Switch to ${next} mode`;
  };
  themeButton.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    const apply = () => { const root = document.documentElement; root.dataset.theme = next; root.style.backgroundColor = ""; root.style.colorScheme = next; syncThemeButton(); };
    try { localStorage.setItem("hfc-theme", next); } catch { /* storage unavailable */ }
    themeButton.classList.add("lunge");
    window.setTimeout(() => themeButton.classList.remove("lunge"), 250);
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(apply);
    else apply();
  });
  syncThemeButton();

  // Dates and times in Cambridge, not the visitor’s timezone.
  const zone = "America/New_York";
  const cambridgeNow = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const toMinutes = hhmm => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };
  const clock = minutes => { const h = Math.floor(minutes / 60), m = minutes % 60; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };

  // ---------- Home: practice list + live "next practice" badge ----------
  const practiceList = $("#practice-list");
  if (practiceList) {
    const sessions = content.practice.sessions;
    const items = sessions.map(session => make("li", { className: "practice-item" }, make("span", { className: "practice-day" }, session.day, session.tag ? make("small", {}, session.tag) : ""), make("span", { className: "practice-time" }, session.time)));
    practiceList.replaceChildren(...items);
    $("#practice-location").textContent = content.practice.location;
    if (content.join) $("#join-text").textContent = content.join;
    $(".practice-where").href = safeUrl(content.practice.mapUrl, $(".practice-where").href);

    const updateNext = () => {
      const now = cambridgeNow();
      const timed = sessions.map((session, i) => ({ session, i })).filter(({ session }) => Number.isInteger(session.weekday) && session.start);
      if (!timed.length) return;
      let best = null;
      for (const { session, i } of timed) {
        const start = toMinutes(session.start), end = toMinutes(session.end || session.start);
        let days = (session.weekday - now.weekday + 7) % 7;
        const live = days === 0 && now.minutes >= start && now.minutes < end;
        if (days === 0 && now.minutes >= end) days = 7;
        const wait = live ? -1 : days * 1440 + start - now.minutes;
        if (!best || wait < best.wait) best = { session, i, days, live, wait, start, end };
      }
      const { session, days, live, start, end } = best;
      const what = session.label || "Practice";
      const when = live ? `${what} on now · until ${clock(end)}` : `Next ${what.toLowerCase()} · ${days === 0 ? "Today" : days === 1 ? "Tomorrow" : session.day} at ${clock(start)}`;
      $("#next-text").textContent = when;
      $("#next-badge").classList.toggle("is-later", !live);
      $("#next-badge").hidden = false;
      items.forEach((item, i) => item.classList.toggle("is-next", i === best.i));
    };
    updateNext();
    window.setInterval(updateNext, 60000);
  }

  // ---------- Home: photo slideshow (photos.js lists the club Drive folder's images) ----------
  const gallery = $("#gallery");
  if (gallery) mountPhotos();
  function mountPhotos() {
    const photos = (window.CLUB_PHOTOS?.ids || []).filter(id => /^[A-Za-z0-9_-]{10,200}$/.test(id))
      .map(id => `https://drive.google.com/thumbnail?id=${id}&sz=w1600`);
    if (content.slideshow.shuffle) for (let i = photos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [photos[i], photos[j]] = [photos[j], photos[i]]; }
    if (!photos.length) return; // Keeps the static photo in index.html.
    const frames = photos.map((src, i) => {
      const image = make("img", { alt: "Photo from Harvard Fencing Club", width: 1600, height: 1067, decoding: "async", referrerPolicy: "no-referrer" });
      image.dataset.src = src;
      if (!i) image.setAttribute("fetchpriority", "high");
      image.addEventListener("error", () => { const fallback = make("div", { className: "gallery-fallback" }, "En garde"); fallback.setAttribute("role", "img"); fallback.setAttribute("aria-label", "Photo unavailable"); image.replaceWith(fallback); }, { once: true });
      const frame = make("figure", { className: "gallery-slide" }, image);
      frame.setAttribute("role", "group"); frame.setAttribute("aria-roledescription", "slide"); frame.setAttribute("aria-label", `${i + 1} of ${photos.length}`);
      return frame;
    });
    $("#gallery-stage").replaceChildren(...frames);
    $("#gallery-controls").hidden = photos.length < 2;
    const scrub = $("#gallery-scrub");
    scrub.max = photos.length; scrub.hidden = photos.length < 2;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pauseButton = $("#slide-pause");
    const interval = Math.max(3500, Number(content.slideshow.intervalMs) || 5500);
    const pauseIcon = pauseButton.innerHTML;
    const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
    let index = 0, timer = null, hovered = false, inView = true;
    let userPaused = content.slideshow.autoplay === false || motionQuery.matches;

    function syncTimer() {
      window.clearInterval(timer); timer = null;
      pauseButton.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
      pauseButton.innerHTML = userPaused ? playIcon : pauseIcon;
      if (photos.length > 1 && !userPaused && !hovered && inView && !document.hidden) timer = window.setInterval(() => show(index + 1), interval);
    }
    const load = i => { const image = $("img", frames[i]); if (image && !image.hasAttribute("src")) image.src = image.dataset.src; };
    function show(next, announce = false) {
      index = (next + photos.length) % photos.length;
      load(index); load((index + 1) % photos.length); // Only the current and next photo.
      frames.forEach((frame, i) => { frame.classList.toggle("is-active", i === index); frame.setAttribute("aria-hidden", String(i !== index)); });
      $("#gallery-count").textContent = `${String(index + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
      syncScrub(index);
      if (announce) { $("#slide-announcement").textContent = `Photo ${index + 1} of ${photos.length}`; syncTimer(); }
    }
    // Scrubber: drag to flick through photos. The counter follows instantly; the photo
    // itself loads once the thumb settles briefly, so fast drags don't fetch every image.
    function syncScrub(i) { scrub.value = i + 1; scrub.style.setProperty("--pct", `${photos.length > 1 ? i / (photos.length - 1) * 100 : 0}%`); }
    let scrubTimer = null;
    scrub.addEventListener("input", () => {
      userPaused = true;
      const i = Number(scrub.value) - 1;
      syncScrub(i);
      $("#gallery-count").textContent = `${String(i + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
      window.clearTimeout(scrubTimer);
      scrubTimer = window.setTimeout(() => show(i, true), 90);
    });
    $("#slide-prev").addEventListener("click", () => show(index - 1, true));
    $("#slide-next").addEventListener("click", () => show(index + 1, true));
    pauseButton.addEventListener("click", () => { userPaused = !userPaused; syncTimer(); });
    gallery.addEventListener("mouseenter", () => { hovered = true; syncTimer(); });
    gallery.addEventListener("mouseleave", () => { hovered = false; syncTimer(); });
    gallery.addEventListener("keydown", event => {
      if (event.target === scrub) return;
      if (event.key === "ArrowRight") { event.preventDefault(); userPaused = true; show(index + 1, true); }
      if (event.key === "ArrowLeft") { event.preventDefault(); userPaused = true; show(index - 1, true); }
    });
    let touchStart = null;
    gallery.addEventListener("touchstart", event => { if (event.target === scrub) { touchStart = null; return; } const t = event.changedTouches[0]; touchStart = { x: t.clientX, y: t.clientY }; }, { passive: true });
    gallery.addEventListener("touchend", event => {
      if (!touchStart) return;
      const t = event.changedTouches[0], dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { userPaused = true; show(index + (dx < 0 ? 1 : -1), true); }
      touchStart = null;
    }, { passive: true });
    document.addEventListener("visibilitychange", syncTimer);
    motionQuery.addEventListener("change", event => { if (event.matches) userPaused = true; syncTimer(); });
    if ("IntersectionObserver" in window) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; syncTimer(); }, { threshold: .15 }).observe(gallery);
    show(0); syncTimer();
  }

  // ---------- Events ----------
  const eventsList = $("#events-list");
  if (eventsList) {
    const events = content.events || [];
    eventsList.replaceChildren(...events.map(event => {
      const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(event.date || "");
      const isPast = hasDate && event.date < today;
      const tile = make("div", { className: `event-date${hasDate || event.repeats ? "" : " is-open"}${isPast ? " is-past" : ""}` });
      if (hasDate) {
        const date = new Date(`${event.date}T12:00:00`);
        tile.append(make("span", { className: "m" }, date.toLocaleString("en-US", { month: "short" })), make("span", { className: "d" }, String(date.getDate())));
      } else if (event.repeats) tile.append(make("span", { className: "m" }, "Every"), make("span", { className: "d" }, event.repeats));
      else tile.append(make("span", { className: "m" }, "Date"), make("span", { className: "d" }, "TBA"));
      const sub = [event.subtitle, hasDate ? new Date(`${event.date}T12:00:00`).toLocaleString("en-US", { weekday: "long" }) : "", event.place].filter(Boolean).join(" · ");
      const href = safeUrl(event.href);
      const link = href ? make("a", { className: "event-link", href }, event.linkLabel || "Find out more", " ↗") : "";
      if (link && /^https?:/i.test(href)) external(link);
      return make("article", { className: "card event-card" }, tile, make("div", {},
        make("p", { className: "label event-tag" }, isPast ? `Past · ${event.tag}` : event.tag),
        make("h2", {}, event.title),
        make("p", { className: "event-sub" }, sub),
        make("p", { className: "event-desc" }, event.description),
        link));
    }));
    if (!events.length) eventsList.append(make("p", {}, "New events are on the way — check Instagram for the latest."));
  }

  // ---------- Team ----------
  const leadersGrid = $("#leaders-grid");
  if (leadersGrid) {
    leadersGrid.replaceChildren(...content.leaders.map(leader => {
      const words = leader.name.split(/\s+/).filter(Boolean);
      const portrait = make("div", { className: "leader-portrait" }, make("span", {}, (words[0][0] + (words.length > 1 ? words.at(-1)[0] : "")).toUpperCase()));
      portrait.firstChild.setAttribute("aria-hidden", "true");
      const photo = safeUrl(leader.photo);
      if (photo) {
        const image = make("img", { alt: leader.name, loading: "lazy", referrerPolicy: "no-referrer", src: photo });
        image.style.objectPosition = leader.photoPosition || "50% 40%";
        image.addEventListener("error", () => { image.remove(); portrait.classList.remove("has-photo"); }, { once: true });
        portrait.classList.add("has-photo");
        portrait.append(image);
      }
      return make("article", { className: "card leader-card" }, portrait, make("div", {}, make("h3", {}, leader.name), make("p", { className: "leader-role" }, leader.role || "Club leadership")));
    }));
    const outreach = content.outreach || {};
    if (outreach.heading) $("#outreach-title").textContent = outreach.heading;
    if (outreach.body) $("#outreach-body").textContent = outreach.body;
    if (outreach.items?.length) {
      $("#outreach-items").replaceChildren(...outreach.items.map(item => {
        const body = [make("strong", {}, item.title), make("small", {}, item.description || "")];
        const href = safeUrl(item.href);
        return make("li", {}, href ? external(make("a", { href }, ...body)) : make("span", {}, ...body));
      }));
      $("#outreach-items").hidden = false;
    }
  }

  // ---------- Photo slots (Events side column, Team photo row) ----------
  // Empty frames appear only on localhost so the live site never shows blank boxes.
  const isPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const photoSrc = photo => photo.driveId && /^[A-Za-z0-9_-]{10,200}$/.test(photo.driveId) ? `https://drive.google.com/thumbnail?id=${photo.driveId}&sz=w1200` : safeUrl(photo.src);
  function fillPhotos(container, photos, previewSlots) {
    if (!container) return;
    const items = (photos || []).map(photo => {
      const src = photoSrc(photo);
      if (!src) return null;
      const image = make("img", { src, alt: photo.alt || "Harvard Fencing Club", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" });
      if (photo.position) image.style.objectPosition = photo.position;
      return make("figure", { className: "photo-frame" }, image);
    }).filter(Boolean);
    if (!items.length && isPreview) for (let i = 0; i < previewSlots; i++) items.push(make("div", { className: "photo-frame is-empty" }, "Photo"));
    container.replaceChildren(...items);
    container.hidden = !items.length;
  }
  fillPhotos($("#event-photos"), content.eventPhotos, 2);
  fillPhotos($("#team-photos"), content.teamPhotos, 3);

  // ---------- Resources + FAQ ----------
  const resourceGroups = $("#resource-groups");
  if (resourceGroups) {
    resourceGroups.replaceChildren(...content.resources.map(group => make("section", {},
      make("h2", { className: "label section-title" }, group.group),
      make("div", { className: "grid resource-grid" }, ...group.items.map(item => {
        const href = safeUrl(item.href);
        return href ? external(make("a", { className: "card resource-card", href }, make("span", {}, make("strong", {}, item.label), make("small", {}, item.description || "")), arrowIcon())) : "";
      })))));
  }
  const faqList = $("#faq-list");
  if (faqList) {
    faqList.replaceChildren(...content.faqs.map(faq => {
      const icon = make("i", {}, "+"); icon.setAttribute("aria-hidden", "true");
      const answer = make("p", {}, faq.answer);
      const href = safeUrl(faq.link?.href);
      if (href) answer.append(" ", external(make("a", { className: "faq-link", href }, faq.link.label || "Watch", " ↗")));
      return make("details", { className: "faq-item" }, make("summary", {}, make("span", {}, faq.question), icon), answer);
    }));
  }
})();
