/*
 * Strip Duel — a tiny side-view fencing game. You (red, left) vs. the computer (green, right).
 * Advance/retreat to manage distance, lunge to score, parry to stop an attack and riposte.
 * If both lunges land, the fencer who started first gets the point; near-ties score nothing.
 */
(() => {
  "use strict";
  const canvas = document.getElementById("game-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("game-stage");
  const overlay = document.getElementById("game-overlay");
  const W = 1280,
    H = 640,
    FLOOR = 545,
    STRIP_L = 70,
    STRIP_R = 1210,
    MIN_GAP = 240,
    TO = 5;
  const EXTEND = 230,
    RIPOSTE_EXTEND = 150,
    HOLD = 120,
    RECOVER = 380,
    PARRY = 420,
    PARRY_ACTIVE = 280,
    STUN = 600;
  // prepAttack: chance to lunge into your advance (attack on preparation) when in range.
  const LEVELS = [
    {
      name: "Novice",
      opponent: "a novice fencer",
      think: 320,
      react: 330,
      parry: 0.3,
      aggression: 0.25,
      prep: 260,
      riposte: 0.3,
      speed: 0.8,
      prepAttack: 0,
    },
    {
      name: "Intermediate",
      opponent: "an intermediate fencer",
      think: 260,
      react: 270,
      parry: 0.42,
      aggression: 0.33,
      prep: 200,
      riposte: 0.45,
      speed: 0.87,
      prepAttack: 0.1,
    },
    {
      name: "Club",
      opponent: "a club fencer",
      think: 190,
      react: 200,
      parry: 0.6,
      aggression: 0.45,
      prep: 130,
      riposte: 0.75,
      speed: 0.95,
      prepAttack: 0.25,
    },
    {
      name: "Olympian",
      opponent: "an Olympian",
      think: 90,
      react: 115,
      parry: 0.88,
      aggression: 0.6,
      prep: 40,
      riposte: 1,
      speed: 1.1,
      prepAttack: 0.6,
    },
  ];
  const FONT = () =>
    getComputedStyle(document.documentElement).getPropertyValue("--display").trim() ||
    "Helvetica, Arial, sans-serif";
  const COLORS = { player: "#ff3b4e", cpu: "#3ee07a" };
  let level = LEVELS[1];
  let record = { w: 0, l: 0 };
  try {
    record = { ...record, ...JSON.parse(localStorage.getItem("hfc-duel-record") || "{}") };
  } catch {
    /* storage unavailable */
  }

  const fencer = (side) => ({
    side,
    f: side === "player" ? 1 : -1,
    x: 0,
    state: "idle",
    t: 0,
    e: 0,
    p: 0,
    move: 0,
    walk: 0,
    score: 0,
    extend: EXTEND,
    lungeStart: 0,
    hitDone: false,
    riposteUntil: 0,
    flash: 0,
  });
  const player = fencer("player"),
    cpu = fencer("cpu");
  let phase = "menu",
    phaseT = 0,
    now = 0,
    banner = null,
    lamps = { player: false, cpu: false },
    pending = [],
    resolveAt = 0;
  let cpuThink = 0,
    cpuReactAt = 0,
    cpuMoveUntil = 0;
  const held = { advance: false, retreat: false };

  const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const opponent = (who) => (who === player ? cpu : player);
  const bodyX = (who) => who.x + who.f * 60 * who.e;
  const tipDx = (who) => 180 + 95 * who.e;
  const say = (text, color = "#fff6f4", ms = 900, size = 72) => {
    banner = { text, color, until: now + ms, size };
  };

  function resetPositions() {
    Object.assign(player, {
      x: 420,
      state: "idle",
      t: 0,
      e: 0,
      p: 0,
      move: 0,
      hitDone: false,
      riposteUntil: 0,
    });
    Object.assign(cpu, { x: 860, state: "idle", t: 0, e: 0, p: 0, move: 0, hitDone: false, riposteUntil: 0 });
    pending = [];
    lamps = { player: false, cpu: false };
    cpuReactAt = 0;
    cpuMoveUntil = 0;
  }
  function startMatch() {
    player.score = cpu.score = 0;
    resetPositions();
    overlay.hidden = true;
    stage.focus({ preventScroll: true });
    phase = "ready";
    phaseT = now;
    say("Allez!", "#fff6f4", 700);
  }

  // ---------- Actions ----------
  const canAct = (who) => phase === "fencing" && who.state === "idle";
  function lunge(who, prep = 0) {
    if (!canAct(who)) return;
    const riposte = now < who.riposteUntil;
    Object.assign(who, {
      state: prep && !riposte ? "prep" : "lunge",
      t: 0,
      hitDone: false,
      extend: riposte ? RIPOSTE_EXTEND : EXTEND,
      prepMs: prep,
      move: 0,
    });
    if (who.state === "lunge") who.lungeStart = now;
    if (who === player && who.state === "lunge") cpuReactAt = now + level.react * (0.8 + Math.random() * 0.4);
  }
  function parry(who) {
    if (canAct(who)) Object.assign(who, { state: "parry", t: 0, move: 0 });
  }

  function update(dt) {
    now += dt;
    if (phase === "ready" && now - phaseT > 700) phase = "fencing";
    if (phase === "halt" && now - phaseT > 1400) {
      if (player.score >= TO || cpu.score >= TO) return finish();
      resetPositions();
      phase = "ready";
      phaseT = now;
      say("Allez!", "#fff6f4", 700);
    }
    if (phase === "fencing" || phase === "halt") {
      if (phase === "fencing") {
        player.move = held.advance && !held.retreat ? 1 : held.retreat && !held.advance ? -1 : 0;
        runCpu();
      }
      [player, cpu].forEach((who) => step(who, dt));
      // Keep distance: blades may cross, bodies may not.
      const gap = cpu.x - player.x;
      if (gap < MIN_GAP) {
        const push = (MIN_GAP - gap) / 2;
        player.x -= push;
        cpu.x += push;
      }
      if (phase === "fencing") {
        checkHits(player);
        checkHits(cpu);
        if (pending.length && now >= resolveAt) resolve();
        if (player.x < STRIP_L) award(cpu, "Off the strip");
        else if (cpu.x > STRIP_R) award(player, "Off the strip");
      }
    }
  }

  function step(who, dt) {
    who.t += dt;
    if (who.flash > 0) who.flash -= dt;
    if (who.state === "idle" && phase === "fencing" && who.move) {
      const speed = (who.move > 0 ? 240 : 270) * (who === cpu ? level.speed : 1);
      who.x += (who.f * who.move * speed * dt) / 1000;
      who.walk += (dt / 1000) * 11;
    }
    if (who.state === "prep" && who.t >= who.prepMs) {
      who.state = "lunge";
      who.t = 0;
      who.lungeStart = now;
    }
    if (who.state === "lunge") {
      if (who.t < who.extend) who.e = ease(who.t / who.extend);
      else if (who.t < who.extend + HOLD) who.e = 1;
      else if (who.t < who.extend + HOLD + RECOVER) who.e = 1 - ease((who.t - who.extend - HOLD) / RECOVER);
      else {
        who.state = "idle";
        who.e = 0;
        who.t = 0;
      }
    }
    if (who.state === "parry") {
      who.p = who.t < 60 ? who.t / 60 : who.t > PARRY - 100 ? Math.max(0, (PARRY - who.t) / 100) : 1;
      if (who.t >= PARRY) {
        who.state = "idle";
        who.p = 0;
        who.t = 0;
      }
    }
    if (who.state === "stunned") {
      who.e = Math.max(0, who.e - dt / 300);
      if (who.t >= STUN) {
        who.state = "idle";
        who.t = 0;
        who.e = 0;
      }
    }
  }

  function checkHits(attacker) {
    if (attacker.state !== "lunge" || attacker.hitDone || attacker.t > attacker.extend + HOLD) return;
    const target = opponent(attacker);
    const tip = attacker.x + attacker.f * tipDx(attacker);
    const front = bodyX(target) + target.f * 25;
    if ((tip - front) * attacker.f < 0) return;
    attacker.hitDone = true;
    if (target.state === "parry" && target.t < PARRY_ACTIVE) {
      attacker.state = "stunned";
      attacker.t = 0;
      target.state = "idle";
      target.p = 0;
      target.t = 0;
      target.riposteUntil = now + 700;
      say("Parry!", "#ffd27a", 600, 52);
      if (target === cpu && Math.random() < level.riposte) lunge(cpu, 0);
      return;
    }
    if (!pending.length) resolveAt = now + 60;
    pending.push(attacker);
  }

  function resolve() {
    const [a, b] = pending;
    pending = [];
    if (!b) return award(a, "Touché!");
    lamps = { player: true, cpu: true };
    const diff = a.lungeStart - b.lungeStart;
    if (Math.abs(diff) < 50) {
      phase = "halt";
      phaseT = now;
      say("Simultaneous", "#fff6f4", 1300, 60);
      return;
    }
    award(diff < 0 ? a : b, "Right of way!");
  }

  function award(scorer, text) {
    scorer.score += 1;
    lamps = { player: scorer === player || lamps.player, cpu: scorer === cpu || lamps.cpu };
    opponent(scorer).flash = 400;
    phase = "halt";
    phaseT = now;
    say(text, COLORS[scorer.side], 1300);
  }

  function finish() {
    const won = player.score > cpu.score;
    record[won ? "w" : "l"] += 1;
    try {
      localStorage.setItem("hfc-duel-record", JSON.stringify(record));
    } catch {
      /* storage unavailable */
    }
    showRecord();
    phase = "over";
    document.getElementById("overlay-title").textContent = won ? "Victory!" : "Defeat.";
    document.getElementById("overlay-text").textContent =
      `${player.score}–${cpu.score} against ${level.opponent}. ${won ? (level.name === "Olympian" ? "You are the GOAT." : "Try a harder opponent?") : "Salute and rematch!"}`;
    document.getElementById("start-btn").textContent = "Rematch";
    overlay.hidden = false;
    document.getElementById("start-btn").focus({ preventScroll: true });
  }

  // ---------- Computer opponent ----------
  function runCpu() {
    const gap = cpu.x - player.x;
    if (cpuReactAt && now >= cpuReactAt) {
      cpuReactAt = 0;
      if (cpu.state === "idle") {
        const roll = Math.random();
        if (roll < level.parry) parry(cpu);
        else if (roll < level.parry + (1 - level.parry) / 2 && cpu.x < STRIP_R - 60) {
          cpu.move = -1;
          cpuMoveUntil = now + 300;
        }
      }
    }
    if (cpu.state !== "idle" || now < cpuThink || now < cpuMoveUntil) return;
    cpuThink = now + level.think * (0.7 + Math.random() * 0.6);
    const punish = player.state === "lunge" && player.t > player.extend + HOLD;
    const intoAdvance = player.move === 1 && player.state === "idle" && gap <= 330;
    if (
      (punish && gap <= 320 && Math.random() < level.aggression + 0.35) ||
      (intoAdvance && Math.random() < level.prepAttack) ||
      (gap <= 305 && Math.random() < level.aggression)
    )
      return lunge(cpu, level.prep);
    const nearEnd = cpu.x > STRIP_R - 90;
    if (gap > 330 + Math.random() * 40) cpu.move = 1;
    else if (gap < 265 && !nearEnd) cpu.move = -1;
    else {
      const r = Math.random();
      cpu.move = r < 0.45 ? 1 : r < 0.75 && !nearEnd ? -1 : 0;
    }
  }

  // ---------- Drawing ----------
  const STANCE = {
    bf: [-60, 0],
    ff: [50, 0],
    bk: [-45, -48],
    fk: [45, -50],
    hip: [-5, -92],
    sh: [5, -170],
    head: [12, -200],
    ae: [-40, -160],
    ah: [-38, -205],
    se: [40, -150],
    sh2: [75, -150],
  };
  const LUNGE = {
    bf: [-60, 0],
    ff: [175, 0],
    bk: [-8, -38],
    fk: [158, -62],
    hip: [45, -75],
    sh: [75, -150],
    head: [86, -178],
    ae: [20, -150],
    ah: [-25, -140],
    se: [125, -152],
    sh2: [165, -150],
  };

  function pose(who) {
    const j = {};
    for (const k in STANCE)
      j[k] = [lerp(STANCE[k][0], LUNGE[k][0], who.e), lerp(STANCE[k][1], LUNGE[k][1], who.e)];
    if (who.state === "idle" && who.move && phase === "fencing") {
      const bob = Math.sin(who.walk * 2);
      j.ff[0] += bob * 9;
      j.ff[1] -= Math.max(0, bob) * 8;
      j.fk[0] += bob * 6;
      j.bf[0] -= bob * 6;
      j.bf[1] -= Math.max(0, -bob) * 6;
    }
    if (who.state === "prep") {
      j.hip[1] += 6;
      j.sh[0] -= 6;
      j.head[0] -= 6;
      j.se[0] -= 8;
      j.sh2[0] -= 12;
    }
    // Blade: from hand toward tip. Parry raises it, a stun knocks it back.
    let tip = [j.sh2[0] + 105 + 10 * who.e, j.sh2[1] - 15 + 13 * who.e];
    if (who.p > 0) {
      j.se = [lerp(j.se[0], 35, who.p), lerp(j.se[1], -132, who.p)];
      j.sh2 = [lerp(j.sh2[0], 58, who.p), lerp(j.sh2[1], -150, who.p)];
      tip = [lerp(tip[0], 95, who.p), lerp(tip[1], -254, who.p)];
    }
    if (who.state === "stunned") {
      j.sh2 = [55, -168];
      tip = [10, -268];
    }
    j.tip = tip;
    return j;
  }

  function drawFencer(who) {
    const j = pose(who);
    const P = ([dx, dy]) => [who.x + who.f * dx, FLOOR + dy];
    const line = (pts, width, color) => {
      ctx.beginPath();
      pts.map(P).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    const hit = who.flash > 0;
    const suit = hit ? "#ffffff" : "#f3ece9";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(who.x + who.f * lerp(-5, 55, who.e), FLOOR + 4, 95 + 40 * who.e, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = COLORS[who.side];
    ctx.shadowBlur = hit ? 40 : 14;
    line([j.bf, j.bk, j.hip], 17, suit);
    line([j.ff, j.fk, j.hip], 17, suit);
    line([j.hip, j.sh], 30, suit);
    line([j.sh, j.ae, j.ah], 12, suit);
    ctx.restore();
    // Lamé-free club look: colored belt and sleeve stripe for each side.
    line(
      [
        [j.hip[0] - 6, j.hip[1] - 4],
        [j.hip[0] + 8, j.hip[1] - 6],
      ],
      12,
      COLORS[who.side],
    );
    // Blade and sword arm
    line([j.sh2, j.tip], 4, "#d7dde3");
    line([j.sh, j.se, j.sh2], 12, suit);
    const [gx, gy] = P(j.sh2);
    ctx.fillStyle = "#b9c0c7";
    ctx.beginPath();
    ctx.ellipse(gx + who.f * 6, gy, 5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    const [tx, ty] = P(j.tip);
    ctx.fillStyle = COLORS[who.side];
    ctx.beginPath();
    ctx.arc(tx, ty, 4, 0, Math.PI * 2);
    ctx.fill();
    // Mask
    const [hx, hy] = P(j.head);
    ctx.fillStyle = "#2a2a2e";
    ctx.beginPath();
    ctx.ellipse(hx + who.f * 4, hy, 19, 24, who.f * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1;
    for (let i = -16; i <= 16; i += 6) {
      ctx.beginPath();
      ctx.moveTo(hx + who.f * 4 + i * 0.7, hy - 20);
      ctx.lineTo(hx + who.f * 4 + i * 0.7, hy + 20);
      ctx.stroke();
    }
    ctx.fillStyle = suit;
    ctx.fillRect(hx - 13, hy + 18, 26, 9);
    ctx.fillStyle = COLORS[who.side];
    ctx.fillRect(hx - 13, hy + 18, 26, 3);
  }

  function drawScene() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#3a0816");
    g.addColorStop(0.75, "#1d040b");
    g.addColorStop(1, "#12030a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const spot = ctx.createRadialGradient(W / 2, FLOOR - 120, 40, W / 2, FLOOR - 120, 620);
    spot.addColorStop(0, "rgba(255,90,110,.18)");
    spot.addColorStop(1, "rgba(255,90,110,0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);
    // Strip with warning zones, en-garde lines, and center line.
    ctx.fillStyle = "#4b4448";
    ctx.fillRect(STRIP_L - 30, FLOOR, STRIP_R - STRIP_L + 60, 26);
    ctx.fillStyle = "rgba(255,59,78,.55)";
    ctx.fillRect(STRIP_L - 30, FLOOR, 110, 26);
    ctx.fillRect(STRIP_R - 80, FLOOR, 110, 26);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    [W / 2, 420 - 20, 860 + 20].forEach((x) => ctx.fillRect(x - 1.5, FLOOR, 3, 26));
    ctx.fillStyle = "#2b2629";
    ctx.fillRect(STRIP_L - 30, FLOOR + 26, STRIP_R - STRIP_L + 60, 10);
    // Scoreboard
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 64px ${FONT()}`;
    ctx.fillStyle = "#fff6f4";
    ctx.fillText(`${player.score}   ${cpu.score}`, W / 2, 70);
    ctx.font = `700 14px ${FONT()}`;
    ctx.fillStyle = "rgba(255,240,238,.6)";
    ctx.fillText(`FIRST TO ${TO}`, W / 2, 122);
    ctx.fillText("YOU", W / 2 - 200, 112);
    ctx.fillText(level.name.toUpperCase(), W / 2 + 200, 112);
    [
      ["player", W / 2 - 200],
      ["cpu", W / 2 + 200],
    ].forEach(([side, x]) => {
      ctx.save();
      ctx.fillStyle = lamps[side] ? COLORS[side] : "rgba(255,255,255,.1)";
      if (lamps[side]) {
        ctx.shadowColor = COLORS[side];
        ctx.shadowBlur = 40;
      }
      ctx.fillRect(x - 60, 52, 120, 24);
      ctx.restore();
    });
  }

  function render() {
    const scale = canvas.width / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawScene();
    drawFencer(cpu);
    drawFencer(player);
    if (banner && now < banner.until) {
      const left = (banner.until - now) / 250;
      ctx.globalAlpha = Math.min(1, left);
      ctx.font = `900 ${banner.size}px ${FONT()}`;
      ctx.fillStyle = banner.color;
      ctx.textAlign = "center";
      ctx.fillText(banner.text.toUpperCase(), W / 2, 250);
      ctx.globalAlpha = 1;
    }
  }

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * ratio);
    if (width && canvas.width !== width) {
      canvas.width = width;
      canvas.height = Math.round((width * H) / W);
    }
    render();
  }

  let last = 0;
  function frame(time) {
    const dt = Math.min(50, last ? time - last : 16);
    last = time;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Input ----------
  const KEYS = {
    ArrowRight: "advance",
    d: "advance",
    D: "advance",
    ArrowLeft: "retreat",
    a: "retreat",
    A: "retreat",
    " ": "lunge",
    j: "lunge",
    J: "lunge",
    k: "parry",
    K: "parry",
    ArrowDown: "parry",
    s: "parry",
    S: "parry",
  };
  const press = (action) => {
    if (action === "lunge") lunge(player);
    else if (action === "parry") parry(player);
    else held[action] = true;
  };
  window.addEventListener("keydown", (event) => {
    const action = KEYS[event.key];
    if (!action || phase === "menu" || phase === "over" || event.target.closest?.("input,textarea,select"))
      return;
    event.preventDefault();
    if (!event.repeat) press(action);
  });
  window.addEventListener("keyup", (event) => {
    const action = KEYS[event.key];
    if (action === "advance" || action === "retreat") held[action] = false;
  });
  window.addEventListener("blur", () => {
    held.advance = held.retreat = false;
  });
  document.querySelectorAll("#touch-pad button").forEach((button) => {
    const action = button.dataset.action;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add("is-down");
      press(action);
    });
    const release = () => {
      button.classList.remove("is-down");
      if (action === "advance" || action === "retreat") held[action] = false;
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
      button.addEventListener(type, release),
    );
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  });

  document.querySelectorAll("#difficulty button").forEach((button) =>
    button.addEventListener("click", () => {
      level = LEVELS[Number(button.dataset.level)];
      document
        .querySelectorAll("#difficulty button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      render();
    }),
  );
  document.getElementById("start-btn").addEventListener("click", startMatch);
  stage.tabIndex = -1;

  function showRecord() {
    document.getElementById("record").textContent = `${record.w}–${record.l}`;
  }
  showRecord();
  resetPositions();
  window.addEventListener("resize", resize);
  if (document.fonts?.ready) document.fonts.ready.then(render);
  resize();
  requestAnimationFrame(frame);
})();
