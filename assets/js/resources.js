/*
 * Resources page: link lists and the "First practice?" FAQ, both from content.js.
 */
(() => {
  "use strict";
  if (!window.HFC) return;
  const { content, $, make, safeUrl, external, onMediaChange } = window.HFC;

  const arrowIcon = () => {
    const span = make("span", { className: "arrow" });
    span.setAttribute("aria-hidden", "true");
    span.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 17 17 7M8 7h9v9"/></svg>';
    return span;
  };

  function resourceLink(item) {
    const href = safeUrl(item.href);
    if (!href) return "";
    return external(
      make(
        "a",
        { className: "card resource-card", href },
        make("span", {}, make("strong", {}, item.label), make("small", {}, item.description || "")),
        arrowIcon(),
      ),
    );
  }

  // Link groups fold up on phones (tap a heading to open it) and are always open on wider screens.
  const phone = window.matchMedia("(max-width: 640px)");
  const groups = content.resources.map((group) => {
    const icon = make("i", {}, "+");
    icon.setAttribute("aria-hidden", "true");
    const summary = make(
      "summary",
      { className: "label section-title" },
      make("span", {}, group.group),
      icon,
    );
    summary.addEventListener("click", (event) => {
      if (!phone.matches) event.preventDefault();
    });
    return make(
      "details",
      { className: "resource-group" },
      summary,
      make("div", { className: "grid resource-grid" }, ...group.items.map(resourceLink)),
    );
  });
  const syncGroups = () => groups.forEach((group) => (group.open = !phone.matches));
  syncGroups();
  onMediaChange(phone, syncGroups);
  $("#resource-groups").replaceChildren(...groups);

  // FAQ: each question opens/closes; an answer can end with an optional link.
  $("#faq-list").replaceChildren(
    ...content.faqs.map((faq) => {
      const icon = make("i", {}, "+");
      icon.setAttribute("aria-hidden", "true");
      const answer = make("p", {}, faq.answer);
      const href = safeUrl(faq.link?.href);
      if (href)
        answer.append(
          " ",
          external(make("a", { className: "faq-link", href }, faq.link.label || "Watch", " ↗")),
        );
      return make(
        "details",
        { className: "faq-item" },
        make("summary", {}, make("span", {}, faq.question), icon),
        answer,
      );
    }),
  );
})();
