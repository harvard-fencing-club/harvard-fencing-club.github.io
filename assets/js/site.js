/*
 * Shared by every page: small helpers, contact links, the mobile menu, and the
 * light/dark switch (the Harvard shield in the header). Page-specific code lives
 * in its own file (home.js, gallery.js, events.js, people.js, resources.js).
 */
(() => {
  "use strict";
  const content = window.CLUB_CONTENT;
  if (!content) return;

  // ---------- Helpers (shared with the page scripts through window.HFC) ----------
  const $ = (selector, root = document) => root.querySelector(selector);

  // Create an element: make("a", { href, className }, "text", childElement)
  const make = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  // Only allow web and email links from content.js.
  const safeUrl = (value, fallback = "") => {
    if (!value) return fallback;
    try {
      const { protocol } = new URL(value, document.baseURI);
      return ["https:", "http:", "mailto:"].includes(protocol) ? value : fallback;
    } catch {
      return fallback;
    }
  };

  // Open external links in a new tab.
  const external = (link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  };

  // Older iPhones (before iOS 14) only support the old addListener API.
  const onMediaChange = (query, handler) =>
    query.addEventListener ? query.addEventListener("change", handler) : query.addListener(handler);

  const isLocalPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const isDriveId = (id) => /^[A-Za-z0-9_-]{10,200}$/.test(id);

  // Photo grids from content.js (Events side column, People photo row).
  // Empty frames only appear on the local preview, never on the live site.
  function fillPhotos(container, photos, previewSlots) {
    if (!container) return;
    const items = (photos || [])
      .map((photo) => {
        const src =
          photo.driveId && isDriveId(photo.driveId)
            ? `https://drive.google.com/thumbnail?id=${photo.driveId}&sz=w1200`
            : safeUrl(photo.src);
        if (!src) return null;
        const image = make("img", {
          src,
          alt: photo.alt || "Harvard Fencing Club",
          loading: "lazy",
          decoding: "async",
          referrerPolicy: "no-referrer",
        });
        if (photo.position) image.style.objectPosition = photo.position;
        return make("figure", { className: "photo-frame" }, image);
      })
      .filter(Boolean);
    if (!items.length && isLocalPreview) {
      for (let i = 0; i < previewSlots; i++)
        items.push(make("div", { className: "photo-frame is-empty" }, "Photo"));
    }
    container.replaceChildren(...items);
    container.hidden = !items.length;
  }

  window.HFC = { content, $, make, safeUrl, external, onMediaChange, isDriveId, fillPhotos };

  // ---------- Contact links (filled in from content.js) ----------
  const email = (subject = "", body = "") => {
    if (!subject) return `mailto:${content.email}`;
    const query = `subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
    return `mailto:${content.email}?${query}`;
  };
  const emailTemplates = {
    "first-practice": email(
      "My first fencing practice",
      "Hi Harvard Fencing Club!\n\nI’d like to come to a practice. My fencing experience is: \n\nCould you confirm any schedule changes and what I should bring?\n\nThanks!",
    ),
    outreach: email(
      "Collaborating with Harvard Fencing Club",
      "Hi Harvard Fencing Club!\n\nI’m reaching out from: \n\nI’d love to talk about: \n\nThanks!",
    ),
    check: email(
      "Donating to Harvard Fencing Club by check",
      "Hi Harvard Fencing Club!\n\nI’d like to donate by check. Where should I send it?\n\nThanks!",
    ),
  };
  const handle = content.instagram.replace(/^@/, "");
  const fill = (selector, href) =>
    document.querySelectorAll(selector).forEach((link) => {
      link.href = href(link);
    });
  fill("[data-email]", (link) => emailTemplates[link.dataset.email] || email());
  fill("[data-instagram]", () => `https://www.instagram.com/${encodeURIComponent(handle)}/`);
  fill("[data-whatsapp]", (link) => safeUrl(content.whatsapp, link.href));
  fill("[data-soco]", (link) => safeUrl(content.socoUrl, link.href));
  fill("[data-donate]", (link) => safeUrl(content.donateUrl, link.href));

  // ---------- Mobile menu ----------
  const menuButton = $(".menu-toggle");
  const nav = $("#main-nav");
  const setMenu = (open) => {
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", `${open ? "Close" : "Open"} menu`);
    nav.classList.toggle("is-open", open);
    document.documentElement.classList.toggle("menu-open", open);
  };
  const menuIsOpen = () => menuButton.getAttribute("aria-expanded") === "true";
  menuButton.addEventListener("click", () => setMenu(!menuIsOpen()));
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuIsOpen()) {
      setMenu(false);
      menuButton.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (menuIsOpen() && !event.target.closest(".site-header")) setMenu(false);
  });
  onMediaChange(window.matchMedia("(min-width: 961px)"), (event) => {
    if (event.matches) setMenu(false);
  });

  // ---------- Light / dark mode (click the Harvard shield) ----------
  // The saved choice is applied in _layouts/default.html before the page draws.
  const themeButton = $(".theme-toggle");
  const currentTheme = () => document.documentElement.dataset.theme || "light";
  const labelThemeButton = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    themeButton.setAttribute("aria-label", `Switch to ${next} mode`);
    themeButton.title = `Switch to ${next} mode`;
  };
  themeButton.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    const apply = () => {
      const root = document.documentElement;
      root.dataset.theme = next;
      root.style.backgroundColor = "";
      root.style.colorScheme = next;
      labelThemeButton();
    };
    try {
      localStorage.setItem("hfc-theme", next);
    } catch {
      /* private browsing: not saved */
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(apply);
    else apply();
  });
  labelThemeButton();
})();
