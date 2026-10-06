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

  // Tile sizes: every 10th tile is a big 2x2 feature. To make the grid end in a full
  // rectangle, a few tiles are widened (2x1) so the cell count divides evenly by the
  // number of columns, which depends on screen width (recalculated on resize).
  let sizes = [];
  let columns = 0;
  function planSizes() {
    columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const n = groups.length;
    const featured = new Set(source.featured || []);
    const isFeatured = (group) => group.some((photo) => featured.has(photo));
    sizes = groups.map((group, i) => (columns >= 3 && (i % 10 === 0 || isFeatured(group)) ? "big" : ""));
    const cells = n + 3 * sizes.filter((size) => size === "big").length;
    let missing = (columns - (cells % columns)) % columns;
    // Prefer widening tiles halfway between features, working back from the end.
    for (let i = n - 1; i >= 0 && missing > 0 && columns >= 2; i--) {
      if (i % 10 === 5 && !sizes[i]) ((sizes[i] = "wide"), missing--);
    }
    for (let i = n - 2; i >= 0 && missing > 0 && columns >= 2; i -= 3) {
      if (!sizes[i]) ((sizes[i] = "wide"), missing--);
    }
  }
  planSizes();
  window.addEventListener("resize", () => {
    window.clearTimeout(planSizes.timer);
    planSizes.timer = window.setTimeout(() => {
      const before = columns;
      planSizes();
      if (columns === before) return;
      grid.querySelectorAll(".photo-tile").forEach((tile, i) => {
        tile.classList.toggle("big", sizes[i] === "big");
        tile.classList.toggle("wide", sizes[i] === "wide");
      });
      relabel();
    }, 150);
  });

  function makeTile(group, i) {
    const size = sizes[i];
    const tile = make("button", { className: `photo-tile${size ? ` ${size}` : ""}`, type: "button" });
    tile.dataset.group = String(i);
    const image = make("img", {
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerPolicy: "no-referrer",
      src: photoUrl(group[0], size ? 800 : 400),
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
    relabel();
  }

  // Collections are numbered in the order they appear on screen (left to right, top to
  // bottom). Big tiles can shift a few smaller ones into earlier gaps, so this is read
  // from the actual layout rather than the list order.
  function readingOrder() {
    const shown = [...grid.querySelectorAll(".photo-tile")]
      .filter((tile) => tile.offsetParent !== null)
      .sort((a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft)
      .map((tile) => Number(tile.dataset.group));
    const notYetShown = groups.map((_, i) => i).slice(rendered);
    return shown.concat(notYetShown);
  }
  function relabel() {
    const order = readingOrder();
    order.forEach((groupIndex, position) => {
      const tile = grid.querySelector(`[data-group="${groupIndex}"]`);
      if (!tile) return;
      const size = groups[groupIndex].length;
      tile.setAttribute(
        "aria-label",
        size > 1 ? `Open collection ${position + 1}: ${size} similar photos` : `Open photo ${position + 1}`,
      );
    });
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
  let order = [], // collections in on-screen order
    p = -1, // position in that order
    g = -1, // current collection (index into groups)
    m = 0, // current photo within it
    opener = null;

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
        thumb.addEventListener("click", () => show(p, k));
        return thumb;
      }),
    );
  }
  function show(position, member = 0) {
    p = (position + order.length) % order.length;
    const next = order[p];
    if (next !== g) buildStrip(groups[next]);
    g = next;
    const group = groups[g];
    m = (member + group.length) % group.length;

    box.classList.remove("is-ready");
    boxImage.onload = () => box.classList.add("is-ready");
    boxImage.src = photoUrl(group[m], 1600);
    $("#lb-count").textContent =
      group.length > 1
        ? `Collection ${p + 1} / ${order.length} · photo ${m + 1} of ${group.length}`
        : `Collection ${p + 1} / ${order.length}`;

    strip.hidden = group.length < 2;
    box.classList.toggle("has-strip", group.length > 1);
    [...strip.children].forEach((thumb, k) => thumb.setAttribute("aria-current", String(k === m)));
    strip.children[m]?.scrollIntoView({ block: "nearest", inline: "center" });

    if (group[m + 1]) preload(group[m + 1]);
    preload(groups[order[(p + 1) % order.length]][0]);
    preload(groups[order[(p - 1 + order.length) % order.length]][0]);
  }
  function openViewer(i) {
    opener = document.activeElement;
    order = readingOrder();
    g = -1;
    box.hidden = false;
    document.documentElement.classList.add("viewer-open");
    show(Math.max(0, order.indexOf(i)), 0);
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
  $("#lb-prev").addEventListener("click", () => show(p - 1));
  $("#lb-next").addEventListener("click", () => show(p + 1));
  box.addEventListener("click", (event) => {
    if (event.target === box || event.target.classList.contains("lb-stage")) closeViewer();
  });
  document.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    const keys = {
      Escape: () => closeViewer(),
      ArrowRight: () => show(p + 1),
      ArrowLeft: () => show(p - 1),
      ArrowDown: () => show(p, m + 1),
      ArrowUp: () => show(p, m - 1),
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
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) show(p + (dx < 0 ? 1 : -1));
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) closeViewer();
      swipeStart = null;
    },
    { passive: true },
  );
})();
