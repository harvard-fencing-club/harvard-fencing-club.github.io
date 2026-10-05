/*
 * Gallery page: one tile per "collection" (a burst of similar shots, grouped by
 * tools/update-photos.py) and a full-screen viewer. In the viewer, left/right moves
 * between collections and the thumbnail strip (or up/down) shows the similar shots.
 */
(() => {
  "use strict";
  if (!window.HFC) return;
  const { $, make, isDriveId } = window.HFC;

  const grid = $("#photo-grid");
  const source = window.CLUB_PHOTOS?.gallery || {};
  const groups = (source.groups || (source.ids || []).map((id) => [id]))
    .map((group) => group.filter(isDriveId))
    .filter((group) => group.length);
  const total = groups.reduce((n, group) => n + group.length, 0);
  const photoUrl = (id, width) => `https://lh3.googleusercontent.com/d/${id}=w${width}`;

  $("#gallery-total").textContent = groups.length ? `· ${groups.length} collections, ${total} photos` : "";
  if (!groups.length) {
    grid.replaceChildren(make("p", {}, "Photos are on the way!"));
    return;
  }

  // ---------- Grid: tiles are added in batches as you scroll, so the page stays fast ----------
  const BATCH = 40;
  const stackIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>';
  let rendered = 0;

  function makeTile(group, i) {
    const big = i % 10 === 0; // every 10th tile is a large feature tile
    const tile = make("button", { className: `photo-tile${big ? " big" : ""}`, type: "button" });
    tile.setAttribute(
      "aria-label",
      group.length > 1 ? `Open collection ${i + 1}: ${group.length} similar photos` : `Open photo ${i + 1}`,
    );
    const image = make("img", {
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerPolicy: "no-referrer",
      src: photoUrl(group[0], big ? 800 : 400),
    });
    image.addEventListener("load", () => tile.classList.add("is-loaded"), { once: true });
    image.addEventListener("error", () => tile.classList.add("is-error"), { once: true });
    tile.append(image);
    if (group.length > 1) {
      const badge = make("span", { className: "tile-count" }, String(group.length));
      badge.insertAdjacentHTML("afterbegin", stackIcon);
      tile.append(badge);
    }
    tile.addEventListener("click", () => openViewer(i));
    return tile;
  }
  function renderMore() {
    const tiles = groups.slice(rendered, rendered + BATCH).map((group, k) => makeTile(group, rendered + k));
    grid.append(...tiles);
    rendered += tiles.length;
    if (rendered >= groups.length) moreObserver?.disconnect();
  }
  const moreObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) renderMore();
          },
          { rootMargin: "900px" },
        )
      : null;
  renderMore();
  if (moreObserver) moreObserver.observe($("#grid-sentinel"));
  else while (rendered < groups.length) renderMore();

  // ---------- Full-screen viewer ----------
  const box = $("#lightbox"),
    boxImage = $("#lb-img"),
    strip = $("#lb-strip");
  let g = -1,
    m = 0,
    opener = null; // current collection, current photo in it

  const preload = (id) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.src = photoUrl(id, 1600);
  };
  function buildStrip(group) {
    strip.replaceChildren(
      ...group.map((id, k) => {
        const thumb = make(
          "button",
          { className: "lb-thumb", type: "button" },
          make("img", { alt: "", loading: "lazy", referrerPolicy: "no-referrer", src: photoUrl(id, 160) }),
        );
        thumb.setAttribute("aria-label", `Similar shot ${k + 1} of ${group.length}`);
        thumb.addEventListener("click", () => show(g, k));
        return thumb;
      }),
    );
  }
  function show(groupIndex, member = 0) {
    const next = (groupIndex + groups.length) % groups.length;
    if (next !== g) buildStrip(groups[next]);
    g = next;
    const group = groups[g];
    m = (member + group.length) % group.length;

    box.classList.remove("is-ready");
    boxImage.onload = () => box.classList.add("is-ready");
    boxImage.src = photoUrl(group[m], 1600);
    $("#lb-count").textContent =
      group.length > 1
        ? `Collection ${g + 1} / ${groups.length} · photo ${m + 1} of ${group.length}`
        : `Collection ${g + 1} / ${groups.length}`;

    strip.hidden = group.length < 2;
    box.classList.toggle("has-strip", group.length > 1);
    [...strip.children].forEach((thumb, k) => thumb.setAttribute("aria-current", String(k === m)));
    strip.children[m]?.scrollIntoView({ block: "nearest", inline: "center" });

    if (group[m + 1]) preload(group[m + 1]);
    preload(groups[(g + 1) % groups.length][0]);
    preload(groups[(g - 1 + groups.length) % groups.length][0]);
  }
  function openViewer(i) {
    opener = document.activeElement;
    g = -1;
    box.hidden = false;
    document.documentElement.classList.add("viewer-open");
    show(i, 0);
    requestAnimationFrame(() => box.classList.add("is-open"));
    $("#lb-close").focus();
  }
  function closeViewer() {
    box.classList.remove("is-open");
    document.documentElement.classList.remove("viewer-open");
    window.setTimeout(() => {
      box.hidden = true;
    }, 200);
    opener?.focus();
  }

  $("#lb-close").addEventListener("click", closeViewer);
  $("#lb-prev").addEventListener("click", () => show(g - 1));
  $("#lb-next").addEventListener("click", () => show(g + 1));
  box.addEventListener("click", (event) => {
    if (event.target === box || event.target.classList.contains("lb-stage")) closeViewer();
  });
  document.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    const keys = {
      Escape: () => closeViewer(),
      ArrowRight: () => show(g + 1),
      ArrowLeft: () => show(g - 1),
      ArrowDown: () => show(g, m + 1),
      ArrowUp: () => show(g, m - 1),
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    } else if (event.key === "Tab") {
      // Keep keyboard focus inside the viewer.
      const buttons = [...box.querySelectorAll("button")].filter((button) => !button.closest("[hidden]"));
      const at = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });

  // Phones: swipe left/right between collections, swipe down to close.
  let swipeStart = null;
  boxImage.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      swipeStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  boxImage.addEventListener(
    "touchend",
    (event) => {
      if (!swipeStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - swipeStart.x,
        dy = touch.clientY - swipeStart.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) show(g + (dx < 0 ? 1 : -1));
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) closeViewer();
      swipeStart = null;
    },
    { passive: true },
  );
})();
