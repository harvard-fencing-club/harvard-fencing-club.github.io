/*
 * Home page: the weekly schedule with a live "next practice" badge, and the
 * photo slideshow (photos listed in photos.js, served from Google Drive).
 */
(() => {
  "use strict";
  if (!window.HFC) return;
  const { content, $, make, safeUrl, onMediaChange, isDriveId } = window.HFC;

  // ---------- Schedule + "next practice" badge (always in Cambridge time) ----------
  const cambridgeNow = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((part) => [part.type, part.value]),
    );
    return {
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
  };
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const clock = (minutes) => {
    const h = Math.floor(minutes / 60),
      m = minutes % 60;
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
  };

  const sessions = content.practice.sessions;
  const rows = sessions.map((session) =>
    make(
      "li",
      { className: "practice-item" },
      make(
        "span",
        { className: "practice-day" },
        session.day,
        session.tag ? make("small", {}, session.tag) : "",
      ),
      make("span", { className: "practice-time" }, session.time),
    ),
  );
  $("#practice-list").replaceChildren(...rows);
  $("#practice-location").textContent = content.practice.location;
  $(".practice-where").href = safeUrl(content.practice.mapUrl, $(".practice-where").href);
  if (content.join) $("#join-text").textContent = content.join;
  if (content.joinNote) $("#join-note").textContent = content.joinNote;

  function updateNextPractice() {
    const now = cambridgeNow();
    let soonest = null;
    sessions.forEach((session, i) => {
      if (!Number.isInteger(session.weekday) || !session.start) return;
      const start = toMinutes(session.start),
        end = toMinutes(session.end || session.start);
      let days = (session.weekday - now.weekday + 7) % 7;
      const live = days === 0 && now.minutes >= start && now.minutes < end;
      if (days === 0 && now.minutes >= end) days = 7;
      const wait = live ? -1 : days * 1440 + start - now.minutes;
      if (!soonest || wait < soonest.wait) soonest = { session, i, days, live, wait, start, end };
    });
    if (!soonest) return;
    const { session, days, live, start, end } = soonest;
    const what = session.label || "Practice";
    const dayName = days === 0 ? "Today" : days === 1 ? "Tomorrow" : session.day;
    $("#next-text").textContent = live
      ? `${what} on now · until ${clock(end)}`
      : `Next ${what.toLowerCase()} · ${dayName} at ${clock(start)}`;
    $("#next-badge").classList.toggle("is-later", !live);
    $("#next-badge").hidden = false;
    rows.forEach((row, i) => row.classList.toggle("is-next", i === soonest.i));
  }
  updateNextPractice();
  window.setInterval(updateNextPractice, 60000);

  // ---------- Photo slideshow ----------
  const gallery = $("#gallery");
  const photoData = window.CLUB_PHOTOS?.home || {};
  const photos = (photoData.ids || []).filter(isDriveId);
  if (!photos.length) return; // keeps the static photo in index.html
  if (content.slideshow.shuffle) mixByCollection(photos);

  // Google occasionally refuses a request when many images load at once: retry from its
  // other image server, then once more shortly after; if it still fails, skip that photo.
  const sources = (id) => [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
    `https://lh3.googleusercontent.com/d/${id}=w1600`,
  ];
  const frames = photos.map((id, i) => {
    const image = make("img", {
      alt: "Photo from Harvard Fencing Club",
      width: 1600,
      height: 1067,
      decoding: "async",
      referrerPolicy: "no-referrer",
    });
    image.dataset.src = sources(id)[0];
    image.style.objectPosition = photoData.focus?.[id] || "50% 50%";
    if (i === 0) image.setAttribute("fetchpriority", "high");
    // Tall photos keep their upper portion, where faces usually are.
    image.addEventListener("load", () => {
      if (image.naturalHeight > image.naturalWidth * 1.05 && !photoData.focus?.[id])
        image.style.objectPosition = "50% 20%";
    });
    let attempt = 0;
    image.addEventListener("error", () => {
      attempt += 1;
      if (attempt === 1) image.src = sources(id)[1];
      else if (attempt === 2)
        window.setTimeout(() => {
          image.src = `${sources(id)[0]}&retry=1`;
        }, 2500);
      else {
        frame.dataset.failed = "1";
        if (frames.indexOf(frame) === index) show(index + 1);
      }
    });
    const frame = make("figure", { className: "gallery-slide" }, image);
    frame.setAttribute("role", "group");
    frame.setAttribute("aria-roledescription", "slide");
    frame.setAttribute("aria-label", `${i + 1} of ${photos.length}`);
    return frame;
  });
  $("#gallery-stage").replaceChildren(...frames);

  const scrub = $("#gallery-scrub");
  const pauseButton = $("#slide-pause");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const interval = Math.max(3500, Number(content.slideshow.intervalMs) || 5500);
  const pauseIcon = pauseButton.innerHTML;
  const playIcon =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
  $("#gallery-controls").hidden = photos.length < 2;
  scrub.max = photos.length;
  scrub.hidden = photos.length < 2;

  let index = 0,
    timer = null,
    hovered = false,
    inView = true;
  let userPaused = content.slideshow.autoplay === false || motionQuery.matches;
  const counterText = (i) => `${String(i + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;

  function syncTimer() {
    window.clearInterval(timer);
    timer = null;
    pauseButton.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
    pauseButton.innerHTML = userPaused ? playIcon : pauseIcon;
    const playing = photos.length > 1 && !userPaused && !hovered && inView && !document.hidden;
    if (playing) timer = window.setInterval(() => show(index + 1), interval);
  }
  const loadPhoto = (i) => {
    const image = $("img", frames[i]);
    if (image && !image.hasAttribute("src")) image.src = image.dataset.src;
  };
  function syncScrub(i) {
    scrub.value = i + 1;
    scrub.style.setProperty("--pct", `${photos.length > 1 ? (i / (photos.length - 1)) * 100 : 0}%`);
  }
  function show(next, announce = false) {
    const step = next < index ? -1 : 1;
    index = (next + photos.length) % photos.length;
    for (let tries = 0; frames[index].dataset.failed && tries < photos.length; tries++) {
      index = (index + step + photos.length) % photos.length;
    }
    loadPhoto(index);
    loadPhoto((index + 1) % photos.length); // only the current and next photo
    frames.forEach((frame, i) => {
      frame.classList.toggle("is-active", i === index);
      frame.setAttribute("aria-hidden", String(i !== index));
    });
    $("#gallery-count").textContent = counterText(index);
    syncScrub(index);
    if (announce) {
      $("#slide-announcement").textContent = `Photo ${index + 1} of ${photos.length}`;
      syncTimer();
    }
  }

  // Scrubber: the counter follows instantly; the photo loads once the thumb settles,
  // so a fast drag doesn't download every image.
  let scrubTimer = null;
  scrub.addEventListener("input", () => {
    userPaused = true;
    const i = Number(scrub.value) - 1;
    syncScrub(i);
    $("#gallery-count").textContent = counterText(i);
    window.clearTimeout(scrubTimer);
    scrubTimer = window.setTimeout(() => show(i, true), 90);
  });
  $("#slide-prev").addEventListener("click", () => show(index - 1, true));
  $("#slide-next").addEventListener("click", () => show(index + 1, true));
  pauseButton.addEventListener("click", () => {
    userPaused = !userPaused;
    syncTimer();
  });
  gallery.addEventListener("mouseenter", () => {
    hovered = true;
    syncTimer();
  });
  gallery.addEventListener("mouseleave", () => {
    hovered = false;
    syncTimer();
  });
  gallery.addEventListener("keydown", (event) => {
    if (event.target === scrub) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    userPaused = true;
    show(index + (event.key === "ArrowRight" ? 1 : -1), true);
  });

  // Swipe left/right on phones.
  let touchStart = null;
  gallery.addEventListener(
    "touchstart",
    (event) => {
      if (event.target === scrub) {
        touchStart = null;
        return;
      }
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  gallery.addEventListener(
    "touchend",
    (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x,
        dy = touch.clientY - touchStart.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        userPaused = true;
        show(index + (dx < 0 ? 1 : -1), true);
      }
      touchStart = null;
    },
    { passive: true },
  );

  // Pause when the tab is hidden, the slideshow is scrolled away, or motion is reduced.
  document.addEventListener("visibilitychange", syncTimer);
  onMediaChange(motionQuery, (event) => {
    if (event.matches) userPaused = true;
    syncTimer();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        syncTimer();
      },
      { threshold: 0.15 },
    ).observe(gallery);
  }
  show(0);
  syncTimer();

  // Random order where neighbouring photos (including last -> first) come from gallery
  // collections at least 4 apart, so shots from the same session never play back to back.
  function mixByCollection(list) {
    const collectionOf = {};
    (window.CLUB_PHOTOS?.gallery?.groups || []).forEach((group, k) =>
      group.forEach((id) => {
        collectionOf[id] = k;
      }),
    );
    const farApart = (a, b) =>
      collectionOf[a] === undefined ||
      collectionOf[b] === undefined ||
      Math.abs(collectionOf[a] - collectionOf[b]) >= 4;
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    let best = shuffle(list.slice()),
      bestClashes = Infinity;
    for (let attempt = 0; attempt < 200 && bestClashes > 0; attempt++) {
      const pool = shuffle(list.slice()),
        order = [pool.shift()];
      while (pool.length) {
        const k = pool.findIndex(
          (id) => farApart(order[order.length - 1], id) && (pool.length > 1 || farApart(id, order[0])),
        );
        order.push(pool.splice(k >= 0 ? k : 0, 1)[0]);
      }
      const clashes = order.filter((id, i) => !farApart(id, order[(i + 1) % order.length])).length;
      if (clashes < bestClashes) {
        best = order;
        bestClashes = clashes;
      }
    }
    list.splice(0, list.length, ...best);
  }
})();
