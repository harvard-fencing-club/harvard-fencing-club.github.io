/*
 * Events page: the event list from content.js, plus the photo column beside it.
 */
(() => {
  "use strict";
  if (!window.HFC) return;
  const { content, $, make, safeUrl, external, fillPhotos } = window.HFC;

  // Today's date in Cambridge (YYYY-MM-DD), to mark events as past.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  function dateTile(event) {
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(event.date || "");
    const isPast = hasDate && event.date < today;
    const tile = make("div", {
      className: `event-date${hasDate || event.repeats ? "" : " is-open"}${isPast ? " is-past" : ""}`,
    });
    if (hasDate) {
      const date = new Date(`${event.date}T12:00:00`);
      tile.append(
        make("span", { className: "m" }, date.toLocaleString("en-US", { month: "short" })),
        make("span", { className: "d" }, String(date.getDate())),
      );
    } else if (event.repeats) {
      tile.append(make("span", { className: "m" }, "Every"), make("span", { className: "d" }, event.repeats));
    } else {
      tile.append(make("span", { className: "m" }, "Date"), make("span", { className: "d" }, "TBA"));
    }
    return { tile, hasDate, isPast };
  }

  function eventCard(event) {
    const { tile, hasDate, isPast } = dateTile(event);
    const weekday = hasDate
      ? new Date(`${event.date}T12:00:00`).toLocaleString("en-US", { weekday: "long" })
      : "";
    const details = [event.subtitle, weekday, event.place].filter(Boolean).join(" · ");
    const href = safeUrl(event.href);
    const link = href
      ? make("a", { className: "event-link", href }, event.linkLabel || "Find out more", " ↗")
      : "";
    if (link && /^https?:/i.test(href)) external(link);
    return make(
      "article",
      { className: "card event-card" },
      tile,
      make(
        "div",
        {},
        make("p", { className: "label event-tag" }, isPast ? `Past · ${event.tag}` : event.tag),
        make("h2", {}, event.title),
        make("p", { className: "event-sub" }, details),
        make("p", { className: "event-desc" }, event.description),
        link,
      ),
    );
  }

  const list = $("#events-list");
  const events = content.events || [];
  list.replaceChildren(...events.map(eventCard));
  if (!events.length)
    list.append(make("p", {}, "New events are on the way — check Instagram for the latest."));
  fillPhotos($("#event-photos"), content.eventPhotos, 2);
})();
