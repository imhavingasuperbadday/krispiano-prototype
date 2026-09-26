"use strict";

// Decompiled song-scene sprites are drawn at 320x180 behind the piano.
const SongBackgrounds = (() => {
  const scenes = {
    kris_piano_lower: "lower",
    kris_piano_prophecy: "prophecy",
    kris_piano_last_prophecy: "lastProphecy",
    kris_piano_lancer_waltz: "lancer",
    kris_piano_rouxls: "rouxls",
    kris_piano_shop: "shop",
    kris_piano_waitingroom: "waiting",
    kris_piano_sevenfour: "sevenfour",
    kris_piano_quiz: "quiz"
  };
  // Extracted, unmodified frames from Deltarune_Decompiled chapters 3-5.
  // SHOP specifically uses chapter 5's Shop 3 backdrop and owner.
  const spriteCounts = { fountain: 6, lancer: 9, rouxls: 2,
    shop3bg: 1, shop3owner: 5, tree: 1,
    waiting_tree_leaves_back: 1, waiting_tree_leaves_front: 1,
    waiting_tree_falling_leaf: 1,
    kris_walk_right: 4, kris_walk_left: 4,
    noelle_walk_right: 4, noelle_walk_left: 4,
    susie_walk_right: 4, susie_walk_left: 4,
    ralsei_walk_right: 4, ralsei_walk_left: 4,
    quiz_tenna: 1 };
  const sprites = {};
  const FOREST = [
    // Small distant crowns break up the empty sky; the larger row fills the
    // gaps without matching the bright trees' size or colour.
    { color: "#14271b", trees: [
      [-18, 26, 42, 51], [12, 22, 38, 46], [40, 27, 43, 52],
      [71, 23, 39, 48], [100, 29, 42, 50], [130, 24, 40, 47],
      [158, 27, 43, 52], [190, 22, 39, 47], [218, 28, 42, 51],
      [249, 24, 40, 47], [278, 27, 43, 52], [309, 23, 39, 48]
    ] },
    { color: "#253d2a", trees: [
      [-29, 29, 57, 68], [9, 27, 54, 65], [49, 31, 58, 69],
      [91, 26, 54, 64], [130, 31, 57, 68], [171, 27, 55, 65],
      [211, 32, 58, 69], [253, 27, 55, 65], [293, 32, 58, 69]
    ] }
  ];
  let forestSilhouettes = [];
  function tintTree(image, color) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext("2d");
    g.drawImage(image, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, canvas.width, canvas.height);
    // Let the treetops suggest a forest, then dissolve the lower branches into
    // the black stage. The walkers need that quiet space behind their outlines.
    g.globalCompositeOperation = "destination-in";
    const fade = g.createLinearGradient(0, canvas.height * .3, 0, canvas.height * .6);
    fade.addColorStop(0, "#000");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function preload() {
    const jobs = [];
    for (const [name, count] of Object.entries(spriteCounts)) {
      sprites[name] = [];
      for (let i = 0; i < count; i++) {
        jobs.push(new Promise(resolve => {
          const image = new Image();
          image.onload = () => { sprites[name][i] = image; resolve(); };
          image.onerror = resolve; // Other sprites still load if an optional frame is missing.
          image.src = `assets/background_sprites/${name}_${i}.png`;
        }));
      }
    }
    await Promise.all(jobs);
    if (sprites.tree[0])
      forestSilhouettes = FOREST.map(row => tintTree(sprites.tree[0], row.color));
  }
  const sprite = (g, name, t, fps, x, y, w, h, flip = false) => {
    const frames = sprites[name];
    if (!frames) return;
    const image = frames[Math.floor(t * fps) % frames.length];
    if (!image) return;
    if (flip) {
      g.save();
      g.translate(Math.round(x + w), Math.round(y));
      g.scale(-1, 1);
      g.drawImage(image, 0, 0, Math.round(w), Math.round(h));
      g.restore();
    } else g.drawImage(image, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  // One named frame, for callers that integrate their own stride instead of
  // reading a clock - the SEVEN/FOUR walkers, whose frame comes from how far
  // they have actually walked.
  const spriteFrame = (g, name, index, x, y, w, h) => {
    const frames = sprites[name];
    if (!frames) return;
    const image = frames[((index % frames.length) + frames.length) % frames.length];
    if (image) g.drawImage(image, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const layers = [];
  const sceneStart = {};
  let wanted = null, delay = 0, time = 0;
  const hash = n => {
    const x = Math.sin(n * 127.1 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  // EggRoom_Prototype's Chapter 1 block tree: the original two 105x91 leaf
  // layers and 16x10 falling block, with the trunk deliberately omitted. The
  // canopy sits above and behind the piano; its lower leaves are hidden by the
  // piano lid. The fall originates at the outside of the canopy so a leaf can
  // cross the black space beside the piano instead of disappearing behind it.
  const WAITING_TREE = { x: 158, y: 4, w: 126, h: 109 };
  const waitingTreeFx = { siner: 0, blocktimer: 0, block: null };
  function resetWaitingTreeFx() {
    waitingTreeFx.siner = 0;
    waitingTreeFx.blocktimer = 0;
    waitingTreeFx.block = null;
  }
  function updateWaitingTreeFx(dt) {
    const dt30 = dt * 30;
    waitingTreeFx.siner += dt30;
    waitingTreeFx.blocktimer += dt30;
    // EggRoom spawns at frame 20 of a 48-frame cycle, fades in through 30,
    // fades out from 38, then starts over. Its velocity and acceleration are
    // halved here because this stage uses 320x180 room coordinates.
    if (!waitingTreeFx.block && waitingTreeFx.blocktimer >= 20) {
      const tree = WAITING_TREE;
      const left = tree.x - tree.w / 2;
      waitingTreeFx.block = {
        x: left + tree.w * (.87 + Math.random() * .1),
        y: tree.y + tree.h * (.22 + Math.random() * .2),
        vx: (.4 + Math.random()) / 2,
        vy: (.4 + Math.random() * .9) / 2,
        alpha: 0
      };
    }
    const b = waitingTreeFx.block;
    if (b) {
      b.x += b.vx * dt30;
      b.y += b.vy * dt30;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        const faster = (speed + .05 * dt30) / speed;
        b.vx *= faster;
        b.vy *= faster;
      }
      b.vx += .05 * dt30;
      if (waitingTreeFx.blocktimer <= 30 && b.alpha < 1)
        b.alpha = Math.min(1, b.alpha + .2 * dt30);
      if (waitingTreeFx.blocktimer >= 38)
        b.alpha = Math.max(0, b.alpha - .1 * dt30);
    }
    if (waitingTreeFx.blocktimer >= 48) {
      waitingTreeFx.blocktimer %= 48;
      waitingTreeFx.block = null;
    }
  }
  function drawWaitingTree(g) {
    const tree = WAITING_TREE;
    const left = tree.x - tree.w / 2;
    const siner = waitingTreeFx.siner;
    sprite(g, "waiting_tree_leaves_back", 0, 1,
      left + Math.sin(siner / 12), tree.y + Math.cos(siner / 20), tree.w, tree.h);
    sprite(g, "waiting_tree_leaves_front", 0, 1,
      left + Math.sin(siner / 14) / 2, tree.y + Math.cos(siner / 24) / 2, tree.w, tree.h);
    const b = waitingTreeFx.block;
    if (b) {
      g.save();
      g.globalAlpha *= b.alpha;
      sprite(g, "waiting_tree_falling_leaf", 0, 1, b.x, b.y, 12, 7.5);
      g.restore();
    }
  }
  /* ---------------- SEVEN / FOUR ----------------
     Four trees on one line, and the walkers crossing behind it. The trees do all
     the hiding: there is no clip and nothing painted on the ground, a walker is
     simply behind a canopy or in a gap between two of them.

     The trees are drawn at 68x84, up from 53x66, and that width is what the
     whole layout turns on. The piano covers x 115..203, which no walker can ever
     be seen through, so all the usable width is the 115px either side of it -
     and in 115px a tree and the clearing beside it have to share the space. The
     four trees at [0, 100, 152, 252] give a clearing at 68..99 and 220..251,
     with the two middle trees overlapping behind the piano and showing only a
     sliver each side of it, which reads as the wood carrying on past the piano.
     Any wider and the clearings close up: at 83 wide a 25px Susie is never once
     wholly clear of the foliage.

     A walker's feet land on y=100, level with the top of the trees' root balls
     rather than their base, which is what lets a 46px Noelle hide behind a tree
     at all - lower down, the sprite tapers to a trunk far too narrow to cover
     anyone, and the pass would pop in and out at both ends.
     The cast is drawn at native size, unmodified out of the decompile: kris
     19x38, noelle 23x46, susie 25x43, ralsei 19x40, four frames a direction.
     `foot` is each one's lowest opaque row, so a 46-tall Noelle and a 38-tall
     Kris land on the same ground line instead of floating at different heights.

     The walking stride is local to the background scene.                    */
  const WalkCycle = {
    startFrame: 1,
    stopFrame: 0,
    groundPerFrame(pxPerSec) {
      const raw = pxPerSec / 300;
      const imageSpeed = raw <= .25 ? .25 : raw >= 1 ? .5 : raw;
      return pxPerSec / (imageSpeed * 30);
    }
  };
  const SEVENFOUR = {
    loop: 70.888,              // the length of kris_piano_sevenfour.ogg
    ground: 100,               // where a walker's feet land
    treeW: 68, treeH: 84, treeY: 36,   // the tree line
    trees: [0, 100, 152, 252],
    visits: 6,                 // passes a loop, each 96 or 252 pixels of travel
    cast: {
      kris:   { w: 19, h: 38, foot: 36 },
      noelle: { w: 23, h: 46, foot: 45 },
      susie:  { w: 25, h: 43, foot: 42 },
      ralsei: { w: 19, h: 40, foot: 39 }
    }
  };
  function drawSevenfourForest(g) {
    // The original tree's pixel silhouette keeps the new rows in the same
    // visual language. Depth comes from size and two solid, dark green values.
    // Draw behind the walkers so the cast stays legible in the clearings.
    for (let row = 0; row < forestSilhouettes.length; row++) {
      const image = forestSilhouettes[row];
      for (const [x, y, w, h] of FOREST[row].trees)
        g.drawImage(image, x, y, w, h);
    }
  }
  const CAST_ORDER = ["kris", "noelle", "susie", "ralsei"];
  // The odds, so a hatless Ralsei stays the rarity it was at .94.
  const rollCast = roll => roll < .31 ? "kris" : roll < .62 ? "noelle" :
    roll < .94 ? "susie" : "ralsei";
  // A different member of the cast, for the second of a pair.
  const otherCast = (roll, who) => {
    const mate = rollCast(roll);
    if (mate !== who) return mate;
    const other = rollCast((roll + .5) % 1);
    return other !== who ? other : CAST_ORDER[(CAST_ORDER.indexOf(who) + 1) % 4];
  };
  // Speed ramps up over the first `ramp` seconds, holds, then ramps down over
  // the last, so a pass eases away from the treeline and settles into the far one
  // instead of starting and stopping dead. `vmax` is the peak it holds in the
  // middle, and sevenfourPace is what turns a chosen duration into that peak.
  const sevenfourRamp = duration => Math.min(.6, duration / 3);
  // The two ramps are half-speed on average, so a pass covers its ground in
  // (duration - ramp) worth of full-speed travel, not duration of it.
  const sevenfourPace = (duration, distance) =>
    distance / (duration - sevenfourRamp(duration));
  // Returns the ground covered so far and the speed covering it, which is all a
  // walk needs: position from the first, stride length from the second.
  function sevenfourStride(elapsed, duration, vmax) {
    const ramp = sevenfourRamp(duration);
    if (elapsed <= 0) return { covered: 0, speed: 0 };
    if (elapsed < ramp)
      return { covered: vmax * elapsed * elapsed / (2 * ramp), speed: vmax * elapsed / ramp };
    if (elapsed <= duration - ramp)
      return { covered: vmax * (ramp / 2 + (elapsed - ramp)), speed: vmax };
    const left = Math.max(0, duration - elapsed);
    return {
      covered: vmax * (duration - ramp) - vmax * left * left / (2 * ramp),
      speed: vmax * left / ramp
    };
  }
  // One walker, drawn if it is on stage. `visit` fixes who this is and when it
  // comes; everything else is read back out of the clock, so the whole scene
  // stays a pure function of its time and nothing needs storing between frames.
  function drawSevenfourWalker(g, visit, t) {
    const lead = t - visit.start;
    if (lead < 0 || lead > visit.pause + visit.duration) return;
    const cast = SEVENFOUR.cast[visit.who];
    const walk = sevenfourStride(lead - visit.pause, visit.duration, visit.pace);
    // obj_actor's two poses: a stopped walker sits on frame 0, and one that has
    // just set off is put on frame 1 instead of starting the cycle at the top.
    // Past that the frame comes from the ground actually covered, divided by the
    // ground one frame of obj_actor's image_speed covers - which is what keeps
    // the feet planted under the body instead of sliding along it.
    const frame = walk.speed <= 0 ? WalkCycle.stopFrame
      : WalkCycle.startFrame + Math.floor(walk.covered / visit.ground);
    const x = visit.x + visit.dir * walk.covered;
    const y = SEVENFOUR.ground + visit.depth;
    spriteFrame(g, `${visit.who}_walk_${visit.dir > 0 ? "right" : "left"}`, frame,
      x - cast.w / 2, y - cast.foot, cast.w, cast.h);
  }
  // The pass schedule for one loop of the track. Six walks, laid end to end: the
  // gaps between them are whatever the track has left once the walks themselves
  // are paid for, shared out by weight, so the schedule always fits exactly and
  // no pass is ever cut off in the middle of a clearing. Everybody shares the
  // loop, so a given loop always plays the same six and the scene repeats with
  // the track.
  function sevenfourVisits(loop) {
    // A walker is at its most hidden dead centre behind a tree, and every
    // character's own width fits inside the canopy's narrowest row there, so
    // these four stops are where a pass can begin and end without being seen to
    // appear or disappear.
    const stops = SEVENFOUR.trees.map(tx => tx + SEVENFOUR.treeW / 2);
    const plans = [];
    for (let i = 0; i < SEVENFOUR.visits; i++) {
      const seed = loop * 19 + i * 23 + 11;
      const tempo = 21 + hash(seed + 3) * 13;        // a slow amble, a shade varied
      const pause = .5 + hash(seed + 5) * 1.7;      // a beat standing at the treeline
      // Now and then the whole width of the stage instead of one clearing. Capped
      // at two a loop, because a crossing is four times as long as a single gap
      // and six of them would not fit in the track.
      const wide = i % 3 === 0 && hash(seed + 61) < .5;
      const across = hash(seed + 67) < .5;
      // Tree to tree: one clearing, or the whole way from the far side.
      const from = wide ? (across ? stops[3] : stops[0]) : (across ? stops[0] : stops[3]);
      const to = wide ? (across ? stops[0] : stops[3]) : (across ? stops[1] : stops[2]);
      const travel = Math.abs(to - from);
      const duration = travel / tempo;
      // Now and then a second of them comes through the same way, setting off a
      // beat later from the same hiding and a shade quicker, so it catches the
      // first and they finish the crossing together. It shares the stops rather
      // than being offset from them, so it is never in the open at either end;
      // sitting a pixel lower and drawing last is all that tells the two apart
      // in the frames where they overlap. Being quicker, it can still arrive
      // after the first, so the wait is budgeted for below.
      const follow = hash(seed + 31) < .22 ? .3 + hash(seed + 41) * .6 : 0;
      plans.push({
        seed, who: rollCast(hash(seed + 17)), from, to, follow,
        dir: to > from ? 1 : -1, travel, pause, duration,
        // The peak the eased pass actually reaches, a shade above `tempo` because
        // the ramps are spent at half speed. The stride comes off this and not off
        // `tempo`, or the feet would drift against the body.
        pace: sevenfourPace(duration, travel), gap: hash(seed + 71)
      });
    }
    const lead = 1.5;                               // a beat before anyone sets off
    // What a pass costs the track, including the wait before a second set off.
    const cost = p => {
      let t = p.pause + p.duration;
      if (p.follow) t += p.follow + p.travel / (p.pace * 1.11);
      return t;
    };
    const walked = plans.reduce((a, p) => a + cost(p), 0);
    const slack = Math.max(0, SEVENFOUR.loop - lead - walked);
    const total = plans.reduce((a, p) => a + p.gap, 0) || 1;
    const visits = [];
    let at = lead;
    for (const p of plans) {
      at += slack * p.gap / total;                 // this pass's share of the gaps
      const start = at;
      visits.push({
        who: p.who, dir: p.dir, start, pause: p.pause, duration: p.duration,
        travel: p.travel, pace: p.pace, depth: 0, x: p.from,
        ground: WalkCycle.groundPerFrame(p.pace)
      });
      if (p.follow) {
        const quick = p.pace * (1.05 + hash(p.seed + 53) * .06);
        const mateDuration = p.travel / quick;
        const matePace = sevenfourPace(mateDuration, p.travel);
        visits.push({
          who: otherCast(hash(p.seed + 37), p.who), dir: p.dir,
          start: start + p.follow, pause: p.pause,
          duration: mateDuration, travel: p.travel, pace: matePace,
          depth: 1 + Math.round(hash(p.seed + 47) * 2), x: p.from,
          ground: WalkCycle.groundPerFrame(matePace)
        });
      }
      at = start + p.pause + p.duration;
    }
    return visits;
  }
  function drawSevenfourWalkers(g, t) {
    const loop = Math.floor(t / SEVENFOUR.loop);
    for (const visit of sevenfourVisits(loop)) drawSevenfourWalker(g, visit, t - loop * SEVENFOUR.loop);
  }

  function drawSprites(g, id, t) {
    switch (scenes[id]) {
      case "prophecy":
      case "lastProphecy":
        g.save();
        if (scenes[id] === "lastProphecy") g.filter = "hue-rotate(110deg) saturate(1.5)";
        sprite(g, "fountain", t, 6, 22, -2, 64, 152);
        g.restore();
        break;
      case "lancer": {
        const cycle = t % 16;
        const dancing = (cycle >= 4 && cycle < 8) || cycle >= 12;
        const march = Math.floor(t / 16) * 8 + Math.min(cycle, 4) + Math.max(0, Math.min(cycle - 8, 4));
        for (let i = 0; i < 8; i++) {
          const x = (march * 10 + i * 44) % 360 - 20;
          // Two ranks. The back one is smaller, dimmer and standing further up
          // the terrace, so it reads as distance instead of as floating.
          const front = i % 2 === 1;
          const size = front ? 23 : 18;
          const y = (front ? 134 : 106) +
            (dancing ? Math.sin(t * 9 + i) * 4 : Math.sin(t * 7 + i) * 2);
          g.save();
          if (!front) g.globalAlpha *= .7;
          sprite(g, "lancer", t + i * .22, dancing ? 9 : 4,
            x + (23 - size) / 2, y + 23 - size, size, size, front);
          g.restore();
        }
        break;
      }
      case "rouxls":
        sprite(g, "rouxls", t, 2, 235, 79 + Math.sin(t * 1.5) * 2, 47, 57);
        break;
      case "shop":
        sprite(g, "shop3bg", t, 1, 0, 0, 320, 120);
        sprite(g, "shop3owner", t, 3, 41, 26, 67, 94);
        break;
      case "waiting":
        drawWaitingTree(g);
        break;
      case "sevenfour":
        drawSevenfourForest(g);
        drawSevenfourWalkers(g, t);
        for (const x of SEVENFOUR.trees)
          sprite(g, "tree", t, 1, x, SEVENFOUR.treeY, SEVENFOUR.treeW, SEVENFOUR.treeH);
        break;
      case "quiz":
        sprite(g, "quiz_tenna", t, 1, 247, 19, 60, 109);
        break;
    }
  }

  function setSong(id, restart = false) {
    if (wanted === id) {
      if (restart && id) {
        sceneStart[id] = time;
        if (scenes[id] === "waiting") resetWaitingTreeFx();
      }
      return; // A single-song loop keeps its current scene unless recording restarts it.
    }
    wanted = id;
    if (id) {
      sceneStart[id] = time;
      if (scenes[id] === "waiting") resetWaitingTreeFx();
    }
    delay = id ? .55 : 0;
    if (id === null) for (const layer of layers) layer.goal = 0;
  }
  function update(dt) {
    time += dt;
    if (wanted === "kris_piano_waitingroom" || layers.some(layer => scenes[layer.id] === "waiting"))
      updateWaitingTreeFx(dt);
    if (delay > 0) {
      delay = Math.max(0, delay - dt);
      if (delay > 0) return;
    }
    for (const layer of layers) layer.goal = layer.id === wanted ? 1 : 0;
    if (wanted && !layers.some(layer => layer.id === wanted)) layers.push({ id: wanted, alpha: 0, goal: 1 });
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      layer.alpha += Math.sign(layer.goal - layer.alpha) * Math.min(Math.abs(layer.goal - layer.alpha), dt / 2.1);
      if (layer.alpha <= 0 && layer.goal === 0) layers.splice(i, 1);
    }
  }
  function draw(g, spritesEnabled) {
    if (!spritesEnabled) return;
    g.save();
    for (const layer of layers) {
      g.globalAlpha = layer.alpha * (["sevenfour", "waiting"].includes(scenes[layer.id]) ? 1 : .7);
      drawSprites(g, layer.id, time - sceneStart[layer.id]);
    }
    g.restore();
  }
  return { preload, setSong, update, draw };
})();
