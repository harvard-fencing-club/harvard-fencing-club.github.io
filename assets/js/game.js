/*
 * Strip Duel — a tiny side-view fencing game. You (red, left) vs. the computer (green, right).
 * Advance/retreat to manage distance, lunge to score, parry to stop an attack and riposte.
 * Pick sabre, foil or épée; each has its own rules (WEAPONS below).
 *
 * In every weapon, only touches landing within the weapon's lockout of each other count as a
 * double; otherwise the first touch scores alone. Lockouts are the real ones (sabre 170 ms,
 * foil 300 ms, épée 45 ms) scaled to the game's pace (x0.7).
 *
 * Sabre right of way:
 *  - On a double, a fencer who just parried has priority (the riposte wins).
 *  - Otherwise the attack that started first wins. Advancing straight into a lunge counts
 *    as one continuous attack, starting when the forward movement began; stopping or
 *    stepping back for more than BREAK ms breaks it. Retreating or standing still and
 *    then lunging into an attack already under way is a counter-attack, and loses.
 *  - If both attacks started within 120 ms of each other: on the first action in the box
 *    after "Allez" only, the one who launched the final action (the lunge) clearly first
 *    wins (attack in preparation). The first action ends once either fencer retreats,
 *    pauses after advancing, parries, or a lunge finishes without a touch.
 *    Referees are strict here: only if both lunges start within 40 ms (boxSimul) is it
 *    simultaneous (no point). Outside the first action, it's simply simultaneous.
 *  - A parried or missed attack loses its priority.
 *
 * Foil right of way: as sabre, but on the first action in the box the lunges can start up to
 * 90 ms apart and still be simultaneous (sabre: 40), while outside the box attacks must start
 * within 50 ms of each other (sabre: 120), so simultaneous calls there are rare.
 * Valid target is the torso only (the grey lamé): a touch that only reaches the white arm
 * in front of it is off target (white light), which stops the action with no point, and play
 * restarts from that part of the strip. If the fencer with right of way lands off target,
 * nothing scores, even if the other's counter-attack lands.
 *
 * Épée: no right of way. The whole body is target, including the hand and arm held out in
 * front. The first touch scores; touches within the lockout are a double and both score,
 * except a double at the last touch (both on 4) is annulled.
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
    RED_L = STRIP_L + 80, // inner edge of the left red end zone
    RED_R = STRIP_R - 80, // inner edge of the right red end zone
    FRONT_FOOT = 50, // front foot sits this far ahead of a fencer's centre
    MIN_GAP = 240,
    TO = 5;
  const EXTEND = 230,
    RIPOSTE_EXTEND = 150,
    HOLD = 120,
    RECOVER = 380,
    PARRY = 420,
    PARRY_ACTIVE = 280,
    STUN = 600,
    BREAK = 120, // pausing or retreating this long ends an attack in progress
    PRIORITY = 900, // how long a successful parry keeps the right of way
    BLADE_LENGTH = 108;
  // Rules and look of each weapon. target/offTarget: how far in front of the body a touch
  // counts / is off target. Blade angles are degrees above horizontal: en garde, on the move,
  // at full lunge, and when knocked aside by a parry. parryHand/parryTip: the parry position.
  const WEAPONS = {
    sabre: {
      name: "Sabre",
      lockout: 120,
      rightOfWay: true,
      simul: 120, // attacks starting this close together are simultaneous
      advanceAttack: true, // an unbroken advance into the lunge is all one attack
      box: true, // attack in preparation on the first action in the box
      boxStart: 120, // first action: attacks starting this close together count as "together"...
      boxSimul: 40, // ...and then lunges must start within this to be simultaneous (strict)
      target: 25,
      offTarget: 0,
      guard: 72, // blade held fairly upright
      moving: 45,
      lunge: 0,
      deflect: 62, // knocked up and out of line, not thrown back
      parryHand: [58, -150],
      parryTip: [95, -254], // blade raised to block the cut
    },
    foil: {
      name: "Foil",
      lockout: 210,
      rightOfWay: true,
      simul: 50, // outside the box, simultaneous is rare
      advanceAttack: true,
      box: true,
      boxStart: 120,
      boxSimul: 90, // in the box, a longer simultaneous window than sabre
      boxPatience: 40, // computer: extra wind-up on the first action in the box
      target: 25, // torso only
      offTarget: 55, // the arm and hand held out in front
      guard: 22, // point at the opponent's chest
      moving: 22,
      lunge: -2,
      deflect: 42,
      parryHand: [62, -150],
      parryTip: [120, -244], // quarte: point up, blade across the chest
    },
    epee: {
      name: "Épée",
      lockout: 32,
      rightOfWay: false,
      target: 55, // whole body, including the hand and arm held out in front
      offTarget: 0,
      guard: 10, // point in line with the opponent's wrist
      moving: 10,
      lunge: -4,
      deflect: -16, // pushed down and out of line
      parryHand: [70, -150],
      parryTip: [172, -196], // sixte: a small opposition, point still forward
      advanceAttack: false, // no right of way: only the timing of the touches matters
      strikeInto: [284, 27], // computer: distance to attack into an advance (+ random spread)
    },
  };
  let weapon = WEAPONS.sabre;
  // Extra reach against a target further forward (épée hand), for the computer's distances.
  const reach = () => weapon.target - WEAPONS.sabre.target;
  // prepAttack: chance to lunge into your advance (attack on preparation) when in range.
  // Each level: think/react = decision and reaction times (ms); parry/riposte/aggression/prepAttack/
  // rowSense/forward = probabilities; prep = attack wind-up (ms); speed = footwork speed.
  // Learner and Club are blends between Novice and Pro, spaced so each level beats the one
  // below it about equally often (checked by simulating level-vs-level bouts).
  const LEVELS = [
    {
      name: "Novice",
      opponent: "a novice fencer",
      think: 300,
      react: 320,
      parry: 0.3,
      aggression: 0.35,
      prep: 240,
      riposte: 0.3,
      speed: 0.85,
      prepAttack: 0,
      rowSense: 0,
      forward: 0.55,
    },
    {
      name: "Learner",
      opponent: "a learner",
      think: 192,
      react: 215,
      parry: 0.57,
      aggression: 0.57,
      prep: 135,
      riposte: 0.65,
      speed: 0.98,
      prepAttack: 0.2,
      rowSense: 0.45,
      forward: 0.7,
    },
    {
      name: "Club",
      opponent: "a club fencer",
      think: 124,
      react: 148,
      parry: 0.75,
      aggression: 0.72,
      prep: 68,
      riposte: 0.87,
      speed: 1.06,
      prepAttack: 0.33,
      rowSense: 0.74,
      forward: 0.8,
    },
    {
      name: "Pro",
      opponent: "a pro",
      think: 85,
      react: 110,
      parry: 0.85,
      aggression: 0.8,
      prep: 30,
      riposte: 1,
      speed: 1.1,
      prepAttack: 0.4,
      rowSense: 0.9,
      forward: 0.85,
    },
    {
      // Takes the attack, parries on defence, and controls distance with inhuman reactions.
      name: "Olympian",
      opponent: "an Olympian",
      think: 30,
      react: 45,
      parry: 0.98,
      aggression: 1,
      prep: 0,
      riposte: 1,
      speed: 1.3,
      prepAttack: 0,
      rowSense: 1,
      forward: 1,
      smart: true,
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
    forwardSince: null, // when the current unbroken forward movement began
    notForward: 0, // ms spent not advancing (pausing/retreating)
    attackStart: Infinity, // right-of-way time of the current attack (Infinity = none)
    priorityUntil: 0, // after a successful parry, this fencer has the right of way
    blade: 72, // blade angle above horizontal, in degrees (animated)
  });
  const player = fencer("player"),
    cpu = fencer("cpu");
  let phase = "menu",
    phaseT = 0,
    now = 0,
    banner = null,
    lamps = { player: false, cpu: false },
    pending = [],
    resolveAt = 0,
    lastCall = "",
    firstAction = true, // still the first action in the box after "Allez"?
    restartAt = null; // after an off-target touch, play restarts here (the fencers' midpoint)
  // AI "brains": the computer always has one. (Tests can also give the player one, to
  // play two levels against each other.)
  const newBrain = (lvl) => ({ level: lvl, think: 0, reactAt: 0, moveUntil: 0 });
  const brains = { cpu: newBrain(level), player: null };
  const brainOf = (who) => brains[who.side];
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
    // Back to the en garde lines, or (after an off-target touch) en garde distance where the
    // action stopped, keeping both fencers clear of the red end zones.
    const room = 220 + FRONT_FOOT + 40;
    const mid = restartAt === null ? W / 2 : Math.min(Math.max(restartAt, RED_L + room), RED_R - room);
    restartAt = null;
    Object.assign(player, {
      x: mid - 220,
      state: "idle",
      t: 0,
      e: 0,
      p: 0,
      move: 0,
      hitDone: false,
      riposteUntil: 0,
    });
    Object.assign(cpu, { x: mid + 220, state: "idle", t: 0, e: 0, p: 0, move: 0, hitDone: false, riposteUntil: 0 });
    [player, cpu].forEach((who) =>
      Object.assign(who, {
        forwardSince: null,
        notForward: 0,
        attackStart: Infinity,
        priorityUntil: 0,
        blade: weapon.guard,
        hasAdvanced: false,
        valid: true, // did the latest touch land on valid target?
      }),
    );
    firstAction = true;
    pending = [];
    lamps = { player: false, cpu: false };
    for (const brain of [brains.cpu, brains.player]) if (brain) Object.assign(brain, { reactAt: 0, moveUntil: 0 });
  }
  function startMatch() {
    player.score = cpu.score = 0;
    restartAt = null;
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
    // Sabre: an attack started straight out of an unbroken advance began when the advance did.
    // Foil and épée: it starts when the arm starts extending (after any wind-up).
    who.attackStart = weapon.advanceAttack && who.forwardSince !== null ? who.forwardSince : now;
    who.forwardSince = null;
    if (who.state === "lunge") who.lungeStart = now;
    const foe = brainOf(opponent(who));
    if (foe) foe.reactAt = now + foe.level.react * (0.8 + Math.random() * 0.4);
  }
  function parry(who) {
    if (canAct(who)) firstAction = false;
    if (canAct(who)) Object.assign(who, { state: "parry", t: 0, move: 0, forwardSince: null, attackStart: Infinity });
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
        if (brains.player) runAi(player, brains.player);
        else player.move = held.advance && !held.retreat ? 1 : held.retreat && !held.advance ? -1 : 0;
        runAi(cpu, brains.cpu);
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
        // Off the strip: the front foot has gone back past the red line.
        if (player.x + FRONT_FOOT < RED_L) award(cpu, "Off the strip");
        else if (cpu.x - FRONT_FOOT > RED_R) award(player, "Off the strip");
      }
    }
  }

  function step(who, dt) {
    who.t += dt;
    // Blade angle: en garde, on the move, and fully extended (level) at the end of a lunge.
    const moving = who.state === "idle" && who.move !== 0 && phase === "fencing";
    const target =
      who.state === "stunned"
        ? weapon.deflect
        : who.state === "lunge"
          ? lerp(weapon.moving, weapon.lunge, who.e)
          : who.state === "prep" || moving
            ? weapon.moving
            : weapon.guard;
    const rate = who.state === "lunge" ? 35 : who.state === "stunned" ? 60 : 110; // quick extension and deflection
    who.blade += (target - who.blade) * Math.min(1, dt / rate);
    if (who.flash > 0) who.flash -= dt;
    // Track unbroken forward movement (the start of an attack in sabre).
    if (who.state === "idle" && phase === "fencing") {
      if (who.move === 1) {
        if (who.forwardSince === null) who.forwardSince = now;
        who.notForward = 0;
        who.hasAdvanced = true;
      } else if ((who.notForward += dt) > BREAK || who.move === -1) {
        // A retreat, or stopping after having gone forward, ends the first action in the box.
        if (who.move === -1 || who.hasAdvanced) firstAction = false;
        who.forwardSince = null;
      }
    }
    if (who.state === "idle" && phase === "fencing" && who.move) {
      const speed = (who.move > 0 ? 240 : 270) * (brainOf(who)?.level.speed ?? 1);
      who.x += (who.f * who.move * speed * dt) / 1000;
      who.walk += (dt / 1000) * 11;
    }
    if (who.state === "prep" && who.t >= who.prepMs) {
      who.state = "lunge";
      who.t = 0;
      who.lungeStart = now;
      if (!weapon.advanceAttack) who.attackStart = now;
    }
    if (who.state === "lunge") {
      if (!who.hitDone && who.t > who.extend + HOLD) {
        who.attackStart = Infinity; // attack fell short
        firstAction = false;
      }
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
    const reaches = (ahead) => (tip - (bodyX(target) + target.f * ahead)) * attacker.f >= 0;
    if (reaches(weapon.target)) attacker.valid = true;
    // Foil: fully extended but only reaching the arm in front of the torso is off target.
    else if (weapon.offTarget && attacker.t >= attacker.extend && reaches(weapon.offTarget)) attacker.valid = false;
    else return;
    attacker.hitDone = true;
    if (target.state === "parry" && target.t < PARRY_ACTIVE) {
      attacker.state = "stunned";
      attacker.t = 0;
      attacker.attackStart = Infinity;
      target.state = "idle";
      target.p = 0;
      target.t = 0;
      target.riposteUntil = now + 700;
      target.priorityUntil = now + PRIORITY;
      say("Parry!", "#ffd27a", 600, 52);
      const brain = brainOf(target);
      if (brain && Math.random() < brain.level.riposte) lunge(target, 0);
      return;
    }
    if (!pending.length) resolveAt = now + weapon.lockout;
    pending.push(attacker);
  }

  // Who gets the point when both touches land: see the rules at the top of this file.
  function rightOfWay(a, b) {
    const aRiposte = now < a.priorityUntil,
      bRiposte = now < b.priorityUntil;
    if (aRiposte !== bRiposte) return { winner: aRiposte ? a : b, call: "Riposte!" };
    const diff = a.attackStart - b.attackStart;
    if (!Number.isFinite(diff) && a.attackStart === b.attackStart) return { winner: null, call: "Simultaneous" };
    const inBox = weapon.box && firstAction;
    if (Math.abs(diff) <= (inBox ? weapon.boxStart : weapon.simul)) {
      // Attack in preparation only exists on the first action in the box: whoever finishes
      // first wins. Any other time, two attacks starting together are simultaneous.
      const lungeDiff = a.lungeStart - b.lungeStart;
      if (inBox && Math.abs(lungeDiff) > weapon.boxSimul)
        return { winner: lungeDiff < 0 ? a : b, call: "Attack in prep!" };
      return { winner: null, call: "Simultaneous" };
    }
    return { winner: diff < 0 ? a : b, call: "Right of way!" };
  }
  // Lamps: the fencer's colour for a valid touch, white for off target.
  const lamp = (who) => (who.valid ? true : "white");
  function resolve() {
    const [a, b] = pending;
    pending = [];
    if (!weapon.rightOfWay) return b ? double() : award(a, "Touché!");
    lamps = { [a.side]: lamp(a), ...(b && { [b.side]: lamp(b) }) };
    if (!b) return a.valid ? award(a, "Touché!") : offTarget();
    const { winner, call } = rightOfWay(a, b);
    if (!winner) return halt(call);
    // Right of way, but off target: no point, even if the counter-attack landed.
    if (!winner.valid) return offTarget();
    award(winner, call);
  }
  // Foil off target: the action stops and play restarts from that part of the strip.
  function offTarget() {
    restartAt = (player.x + cpu.x) / 2;
    halt("Off target");
  }
  // No point: stop and go again.
  function halt(call) {
    lastCall = call;
    phase = "halt";
    phaseT = now;
    say(call, "#fff6f4", 1300, 60);
  }
  // Épée double: both score, unless it would decide the bout for both (annulled).
  function double() {
    lamps = { player: true, cpu: true };
    if (player.score === TO - 1 && cpu.score === TO - 1) return halt("Double annulled");
    player.score += 1;
    cpu.score += 1;
    player.flash = cpu.flash = 400;
    halt("Double!");
  }

  function award(scorer, text) {
    lastCall = text;
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
      `${player.score}–${cpu.score} against ${level.opponent} in ${weapon.name.toLowerCase()}. ${won ? (level.name === "Olympian" ? "You are the GOAT." : "Try a harder opponent?") : "Salute and rematch!"}`;
    document.getElementById("start-btn").textContent = "Rematch";
    overlay.hidden = false;
    document.getElementById("start-btn").focus({ preventScroll: true });
  }

  // ---------- Computer opponent ----------
  // Distance to the opponent, and room left behind before the red line.
  const gapOf = (me) => (opponent(me).x - me.x) * me.f;
  const roomBehind = (me) => (me.f === 1 ? me.x + FRONT_FOOT - RED_L : RED_R - (me.x - FRONT_FOOT));

  // Wind-up before the final action. Foilists build the first action in the box more patiently.
  const windUp = (lvl) => lvl.prep + (weapon.box && firstAction ? weapon.boxPatience || 0 : 0);
  function runAi(me, brain) {
    // gap: distance measured against a sabre-length reach, so the same distances work in épée.
    const foe = opponent(me), lvl = brain.level, gap = gapOf(me) - reach();
    // Never back off the end of the strip.
    if (me.move === -1 && roomBehind(me) < 30) me.move = 0;
    // React to an incoming attack: parry, or step back.
    if (brain.reactAt && now >= brain.reactAt) {
      brain.reactAt = 0;
      if (me.state === "idle") {
        const roll = Math.random();
        if (lvl.smart && gap > 285 && roomBehind(me) > 120) {
          me.move = -1; // pull distance so the attack falls short
          brain.moveUntil = now + 260;
        } else if (roll < lvl.parry) parry(me);
        else if (roll < lvl.parry + (1 - lvl.parry) / 2 && roomBehind(me) > 40) {
          me.move = -1;
          brain.moveUntil = now + 300;
        }
      }
    }
    if (me.state !== "idle" || now < brain.think || now < brain.moveUntil) return;
    brain.think = now + lvl.think * (0.7 + Math.random() * 0.6);
    if (lvl.smart) return runSmartAi(me, gap);
    // Stronger levels mostly avoid counter-attacking into an advance (it loses on right of way).
    // In foil and épée an advance is only preparation: they hit it as it comes into reach.
    if (foe.state === "idle" && foe.forwardSince !== null && Math.random() < lvl.rowSense) {
      if (!weapon.advanceAttack) {
        // Their step brings them onto the blade, so watch closely once they're near.
        const [near, spread] = weapon.strikeInto;
        if (gap <= near + spread * Math.random()) return lunge(me, lvl.prep);
        if (gap < 360) brain.think = now + lvl.react * 0.5;
        me.move = gap > 360 ? 1 : 0;
        return;
      }
      // Meet them going forward (the box) and finish first, rather than countering into
      // their advance. Only give a step if caught standing still up close.
      if (me.forwardSince !== null && gap <= 320) return lunge(me, windUp(lvl));
      if (gap > 300 || me.forwardSince !== null) me.move = 1;
      else me.move = roomBehind(me) > 70 ? -1 : 0;
      return;
    }
    const punish = foe.state === "lunge" && foe.t > foe.extend + HOLD;
    const intoAdvance = foe.move === 1 && foe.state === "idle" && gap <= 330;
    if (
      (punish && gap <= 320 && Math.random() < lvl.aggression + 0.35) ||
      (intoAdvance && Math.random() < lvl.prepAttack) ||
      (gap <= 305 && Math.random() < lvl.aggression)
    )
      return lunge(me, windUp(lvl));
    const nearEnd = roomBehind(me) < 70;
    if (gap > 330 + Math.random() * 40) me.move = 1;
    else if (gap < 265 && !nearEnd && Math.random() > lvl.forward) me.move = -1;
    else {
      const r = Math.random();
      me.move = r < lvl.forward ? 1 : r < lvl.forward + (1 - lvl.forward) / 2 && !nearEnd ? -1 : 0;
    }
  }

  // Olympian: plays each weapon's rules.
  function runSmartAi(me, gap) {
    const foe = opponent(me);
    const nearEnd = roomBehind(me) < 70;
    const foeAdvancing = foe.state === "idle" && foe.forwardSince !== null;
    const foeShort = foe.state === "lunge" && foe.t > foe.extend + HOLD;
    if (foeShort) {
      // Their attack fell short: step in and hit during the recovery.
      if (gap <= 300) return lunge(me, 0);
      me.move = 1;
      return;
    }
    if (!weapon.advanceAttack) {
      // Foil and épée: whoever extends first has it. Hit their advance (preparation) the
      // moment it comes into reach; otherwise close in and strike from close range.
      if (gap <= (foeAdvancing ? 305 : 255)) return lunge(me, 0);
      me.move = foeAdvancing && gap < 345 ? 0 : 1;
      return;
    }
    if (foeAdvancing) {
      // Out of the box together: keep coming and beat them to the final action.
      if (me.forwardSince !== null) {
        if (gap <= 320) return lunge(me, 0);
        me.move = 1;
        return;
      }
      // Cornered: hold and parry, only striking from very close.
      if (nearEnd) {
        if (gap <= 255) return lunge(me, 0);
        me.move = 0;
        return;
      }
      // From a distance, go forward to meet them and take the attack in the box.
      if (gap > 345) {
        me.move = 1;
        return;
      }
      // Caught up close without the attack: keep just outside their reach so any attack
      // falls short (never counter into it).
      me.move = gap < 335 ? -1 : 0;
      return;
    }
    // They've stopped or are stepping back: keep advancing (holding the attack) and finish
    // from close range, where the touch lands faster than anyone can react with a parry.
    if (gap <= 255) return lunge(me, 0);
    me.move = 1;
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
    // Blade: from hand toward tip. A parry raises it; being parried pushes it out of line.
    const angle = (who.blade * Math.PI) / 180;
    let tip = [j.sh2[0] + BLADE_LENGTH * Math.cos(angle), j.sh2[1] - BLADE_LENGTH * Math.sin(angle)];
    if (who.p > 0) {
      const [hand, point] = [weapon.parryHand, weapon.parryTip];
      j.se = [lerp(j.se[0], 35, who.p), lerp(j.se[1], -132, who.p)];
      j.sh2 = [lerp(j.sh2[0], hand[0], who.p), lerp(j.sh2[1], hand[1], who.p)];
      tip = [lerp(tip[0], point[0], who.p), lerp(tip[1], point[1], who.p)];
    }
    if (who.state === "stunned") {
      // Parried: the hand lifts a little as the blade is pushed out of line.
      j.sh2 = [j.sh2[0] - 6, j.sh2[1] - 8];
      tip = [j.sh2[0] + BLADE_LENGTH * Math.cos(angle), j.sh2[1] - BLADE_LENGTH * Math.sin(angle)];
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
    const suit = hit ? "#ffffff" : "#f3ece9"; // white jacket, breeches and legs
    // Lamé covers the target: silver on the sabre torso and arms, grey on the foil torso,
    // none in épée (all white).
    const lame = weapon === WEAPONS.sabre ? (hit ? "#f2f4f7" : "#cdd2d8") : weapon === WEAPONS.foil ? (hit ? "#c4c8cd" : "#8f959c") : suit;
    const sleeve = weapon === WEAPONS.sabre ? lame : suit;
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
    line([j.hip, j.sh], 30, lame);
    line([j.sh, j.ae, j.ah], 12, sleeve);
    ctx.restore();
    // Coloured belt for each side.
    line(
      [
        [j.hip[0] - 6, j.hip[1] - 4],
        [j.hip[0] + 8, j.hip[1] - 6],
      ],
      12,
      COLORS[who.side],
    );

    // Blade from the hand to the tip.
    const [hx0, hy0] = P(j.sh2);
    const [tx, ty] = P(j.tip);
    const len = Math.hypot(tx - hx0, ty - hy0) || 1;
    const dx = (tx - hx0) / len,
      dy = (ty - hy0) / len;
    const nx = -dy,
      ny = dx; // perpendicular to the blade
    const bow = ny > 0 ? 1 : -1; // toward the floor side
    const sabre = weapon === WEAPONS.sabre;
    // Sabre: flat blade tapering to a narrow tip. Foil: thin and flexible. Épée: stiffer, thicker.
    const [baseW, tipW] = sabre ? [2.4, 0.9] : weapon === WEAPONS.foil ? [1.7, 0.8] : [2.6, 1.1];
    const bladeBase = [hx0 + dx * 10, hy0 + dy * 10];
    ctx.fillStyle = "#d7dde3";
    ctx.beginPath();
    ctx.moveTo(bladeBase[0] + nx * baseW, bladeBase[1] + ny * baseW);
    ctx.lineTo(tx + nx * tipW, ty + ny * tipW);
    ctx.lineTo(tx - nx * tipW, ty - ny * tipW);
    ctx.lineTo(bladeBase[0] - nx * baseW, bladeBase[1] - ny * baseW);
    ctx.closePath();
    ctx.fill();
    if (weapon === WEAPONS.foil) {
      // Insulating tape on the top sixth of a foil blade, in the fencer's colour.
      const bladeLen = Math.hypot(tx - bladeBase[0], ty - bladeBase[1]);
      const tapeStart = [tx - dx * (bladeLen / 6), ty - dy * (bladeLen / 6)];
      ctx.strokeStyle = COLORS[who.side];
      ctx.lineWidth = 2.6;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(tapeStart[0], tapeStart[1]);
      ctx.lineTo(tx - dx * 2, ty - dy * 2);
      ctx.stroke();
      ctx.lineCap = "round";
    }
    if (!sabre) {
      // Point d'arrêt: the button on the tip of a thrusting weapon.
      ctx.fillStyle = "#6b7178";
      ctx.beginPath();
      ctx.arc(tx, ty, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sword arm over the grip.
    line([j.sh, j.se, j.sh2], 12, sleeve);
    const bell = [hx0 + dx * 8, hy0 + dy * 8];
    const pommel = [hx0 - dx * 14, hy0 - dy * 14];
    ctx.strokeStyle = ctx.fillStyle = "#b9c0c7";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(bell[0], bell[1]);
    if (sabre) {
      // Bell guard, grip, and a knuckle bow joining the bell to the pommel (a closed D shape).
      const bellEdge = [bell[0] + nx * 10 * bow, bell[1] + ny * 10 * bow];
      ctx.lineTo(pommel[0], pommel[1]);
      ctx.quadraticCurveTo(hx0 + nx * 19 * bow, hy0 + ny * 19 * bow, bellEdge[0], bellEdge[1]);
    } else {
      // Pistol grip: a short handle angled down from the bell.
      ctx.lineTo(hx0 - dx * 10 + nx * 6 * bow, hy0 - dy * 10 + ny * 6 * bow);
    }
    ctx.stroke();
    // Bell guard: small and round for foil, large for épée.
    const bellR = sabre ? 10 : weapon === WEAPONS.foil ? 9 : 14;
    ctx.beginPath();
    ctx.ellipse(bell[0], bell[1], 4, bellR, Math.atan2(dy, dx), 0, Math.PI * 2);
    ctx.fill();
    if (sabre) {
      ctx.beginPath();
      ctx.arc(pommel[0], pommel[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mask
    const [hx, hy] = P(j.head);
    // Mask: silver lamé mesh for sabre, black mesh for foil and épée, with a soft highlight.
    const maskX = hx + who.f * 4;
    const sheen = ctx.createLinearGradient(maskX - 19, hy - 24, maskX + 19, hy + 24);
    const shades = sabre ? ["#eef1f4", "#bfc5cc", "#8f969f"] : ["#5a5f66", "#2a2d32", "#141518"];
    shades.forEach((color, i) => sheen.addColorStop([0, 0.55, 1][i], color));
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(maskX, hy, 19, 24, who.f * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = sabre ? "rgba(60,64,72,.35)" : "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    for (let i = -16; i <= 16; i += 6) {
      ctx.beginPath();
      ctx.moveTo(hx + who.f * 4 + i * 0.7, hy - 20);
      ctx.lineTo(hx + who.f * 4 + i * 0.7, hy + 20);
      ctx.stroke();
    }
    ctx.fillStyle = sabre ? lame : suit; // sabre masks have a conductive lamé bib
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
    ctx.fillRect(STRIP_L - 30, FLOOR, RED_L - (STRIP_L - 30), 26);
    ctx.fillRect(RED_R, FLOOR, STRIP_R + 30 - RED_R, 26);
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
    ctx.fillText(`${weapon.name.toUpperCase()} · FIRST TO ${TO}`, W / 2, 122);
    ctx.fillText("YOU", W / 2 - 200, 112);
    ctx.fillText(level.name.toUpperCase(), W / 2 + 200, 112);
    [
      ["player", W / 2 - 200],
      ["cpu", W / 2 + 200],
    ].forEach(([side, x]) => {
      ctx.save();
      const color = lamps[side] === "white" ? "#f4f4f4" : COLORS[side];
      ctx.fillStyle = lamps[side] ? color : "rgba(255,255,255,.1)";
      if (lamps[side]) {
        ctx.shadowColor = color;
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
      brains.cpu.level = level;
      document
        .querySelectorAll("#difficulty button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      render();
    }),
  );
  document.querySelectorAll("#weapon button").forEach((button) =>
    button.addEventListener("click", () => {
      weapon = WEAPONS[button.dataset.weapon];
      document
        .querySelectorAll("#weapon button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      resetPositions();
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
