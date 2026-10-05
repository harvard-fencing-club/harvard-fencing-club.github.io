/*
 * Resources page: link lists and the "First practice?" FAQ, both from content.js.
 */
(() => {
  "use strict";
  if (!window.HFC) return;
  const { content, $, make, safeUrl, external } = window.HFC;

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

  $("#resource-groups").replaceChildren(
    ...content.resources.map((group) =>
      make(
        "section",
        {},
        make("h2", { className: "label section-title" }, group.group),
        make("div", { className: "grid resource-grid" }, ...group.items.map(resourceLink)),
      ),
    ),
  );

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
