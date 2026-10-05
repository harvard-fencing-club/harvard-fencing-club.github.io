/*
 * People page: leadership cards, the outreach/contact box, and the group photo row.
 */
(() => {
  "use strict";
  if (!window.HFC) return;
  const { content, $, make, safeUrl, external, fillPhotos } = window.HFC;

  function leaderCard(leader) {
    const words = leader.name.split(/\s+/).filter(Boolean);
    const initials = (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
    const initialsText = make("span", {}, initials);
    initialsText.setAttribute("aria-hidden", "true");
    const portrait = make("div", { className: "leader-portrait" }, initialsText);

    // Show the photo if there is one; fall back to initials if it fails to load.
    const photo = safeUrl(leader.photo);
    if (photo) {
      const image = make("img", {
        alt: leader.name,
        loading: "lazy",
        referrerPolicy: "no-referrer",
        src: photo,
      });
      image.style.objectPosition = leader.photoPosition || "50% 40%";
      image.addEventListener(
        "error",
        () => {
          image.remove();
          portrait.classList.remove("has-photo");
        },
        { once: true },
      );
      portrait.classList.add("has-photo");
      portrait.append(image);
    }
    return make(
      "article",
      { className: "card leader-card" },
      portrait,
      make(
        "div",
        {},
        make("h3", {}, leader.name),
        make("p", { className: "leader-role" }, leader.role || "Club leadership"),
      ),
    );
  }

  $("#leaders-grid").replaceChildren(...content.leaders.map(leaderCard));

  const outreach = content.outreach || {};
  if (outreach.heading) $("#outreach-title").textContent = outreach.heading;
  if (outreach.body) $("#outreach-body").textContent = outreach.body;
  if (outreach.items?.length) {
    $("#outreach-items").replaceChildren(
      ...outreach.items.map((item) => {
        const body = [make("strong", {}, item.title), make("small", {}, item.description || "")];
        const href = safeUrl(item.href);
        return make("li", {}, href ? external(make("a", { href }, ...body)) : make("span", {}, ...body));
      }),
    );
    $("#outreach-items").hidden = false;
  }

  fillPhotos($("#people-photos"), content.peoplePhotos, 3);
})();
