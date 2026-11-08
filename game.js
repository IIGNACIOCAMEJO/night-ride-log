(function (global, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (global) global.NeonRun = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCORE_KEY = "nightRideLog.neonRun.highScores.v1";
  const LANES = 3;
  const PLAYER_Y = 0.79;
  const BASE_SPEED = 54;
  const MAX_SPEED = 132;
  const HIT_INVULNERABILITY = 1450;
  const ENTITY_TYPES = {
    car: { kind: "obstacle", width: 0.19, height: 0.15 },
    barrier: { kind: "obstacle", width: 0.23, height: 0.09 },
    cone: { kind: "obstacle", width: 0.11, height: 0.1 },
    fuel: { kind: "pickup", width: 0.12, height: 0.1, points: 175 },
    wrench: { kind: "pickup", width: 0.12, height: 0.1, points: 300 }
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function safeNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
  function laneCenter(lane) { return (clamp(lane, 0, LANES - 1) + 0.5) / LANES; }
  function overlaps(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
  }

  function normalizeScore(entry) {
    if (!entry || typeof entry !== "object") return null;
    const score = Math.max(0, Math.floor(safeNumber(entry.score, 0)));
    const distance = Math.max(0, safeNumber(entry.distance, 0));
    const date = typeof entry.date === "string" && !Number.isNaN(Date.parse(entry.date)) ? entry.date : new Date(0).toISOString();
    return { score: score, distance: Number(distance.toFixed(2)), date: date };
  }

  function orderScores(entries) {
    return (Array.isArray(entries) ? entries : []).map(normalizeScore).filter(Boolean).sort(function (a, b) {
      return b.score - a.score || b.distance - a.distance || b.date.localeCompare(a.date);
    }).slice(0, 10);
  }

  function loadScores(storage) {
    if (!storage || typeof storage.getItem !== "function") return [];
    try { return orderScores(JSON.parse(storage.getItem(SCORE_KEY) || "[]")); } catch (_) { return []; }
  }

  function saveScore(storage, entry) {
    const scores = orderScores(loadScores(storage).concat([entry]));
    if (storage && typeof storage.setItem === "function") {
      try { storage.setItem(SCORE_KEY, JSON.stringify(scores)); } catch (_) { /* Storage can be unavailable in privacy mode. */ }
    }
    return scores;
  }

  function createInitialState(options) { return new NeonRunModel(options).start(); }
  function changeLane(state, delta) { state.move(delta); return state; }
  function stepState(state, deltaMs) { state.update(deltaMs); return state; }
  function checkCollision(player, entity) { return overlaps(player, entity); }
  function resolveCollision(state, entity) {
    if (!state.entities.includes(entity)) state.entities.push(entity);
    entity.x = laneCenter(state.lane); entity.y = PLAYER_Y;
    state.resolveCollisions(); state.score = Math.floor(state.distance * 1000) + state.pickupScore;
    return state;
  }

  class NeonRunModel {
    constructor(options) {
      options = options || {};
      this.random = typeof options.random === "function" ? options.random : Math.random;
      this.reset();
    }

    reset() {
      this.lane = 1;
      this.lives = 3;
      this.elapsed = 0;
      this.distance = 0;
      this.pickupScore = 0;
      this.score = 0;
      this.speed = BASE_SPEED;
      this.brakeRemaining = 0;
      this.invulnerableRemaining = 0;
      this.spawnRemaining = 760;
      this.entities = [];
      this.running = false;
      this.paused = false;
      this.gameOver = false;
      this.events = [];
      this.nextEntityId = 1;
      return this;
    }

    start() { this.reset(); this.running = true; return this; }
    pause() { if (this.running && !this.gameOver) this.paused = true; return this.paused; }
    resume() { if (this.running && !this.gameOver) this.paused = false; return !this.paused; }
    togglePause() { return this.paused ? this.resume() : this.pause(); }

    move(direction) {
      if (!this.running || this.paused || this.gameOver) return false;
      const next = clamp(this.lane + (direction < 0 ? -1 : 1), 0, LANES - 1);
      const changed = next !== this.lane;
      this.lane = next;
      if (changed) this.events.push({ type: "lane", lane: this.lane });
      return changed;
    }

    brake(duration) {
      if (!this.running || this.paused || this.gameOver) return false;
      this.brakeRemaining = Math.max(this.brakeRemaining, safeNumber(duration, 720));
      this.events.push({ type: "brake" });
      return true;
    }

    addEntity(type, lane, y) {
      const spec = ENTITY_TYPES[type];
      if (!spec) throw new Error("Unknown NEON RUN entity: " + type);
      const entity = {
        id: this.nextEntityId++, type: type, kind: spec.kind,
        lane: clamp(Math.floor(safeNumber(lane, 1)), 0, LANES - 1),
        x: laneCenter(lane), y: safeNumber(y, -0.15), width: spec.width, height: spec.height,
        points: spec.points || 0, resolved: false
      };
      this.entities.push(entity);
      return entity;
    }

    spawn() {
      const difficulty = clamp(this.elapsed / 75000, 0, 1);
      const pickupChance = 0.2;
      let type;
      const roll = this.random();
      if (roll < pickupChance) type = this.random() < 0.58 ? "fuel" : "wrench";
      else {
        const options = difficulty > 0.35 ? ["car", "barrier", "cone"] : ["car", "cone"];
        type = options[Math.floor(this.random() * options.length) % options.length];
      }
      return this.addEntity(type, Math.floor(this.random() * LANES), -0.14);
    }

    playerBox() { return { x: laneCenter(this.lane), y: PLAYER_Y, width: 0.14, height: 0.15 }; }

    resolveCollisions() {
      const player = this.playerBox();
      for (const entity of this.entities) {
        if (entity.resolved || !overlaps(player, entity)) continue;
        entity.resolved = true;
        if (entity.kind === "pickup") {
          this.pickupScore += entity.points;
          if (entity.type === "fuel") this.distance += 0.05;
          this.events.push({ type: "pickup", pickup: entity.type, points: entity.points });
        } else if (this.invulnerableRemaining <= 0) {
          this.lives -= 1;
          this.invulnerableRemaining = HIT_INVULNERABILITY;
          this.events.push({ type: "crash", lives: this.lives });
          if (this.lives <= 0) {
            this.lives = 0; this.running = false; this.gameOver = true;
            this.events.push({ type: "gameover" });
          }
        }
      }
    }

    update(deltaMs) {
      if (!this.running || this.paused || this.gameOver) return [];
      const dt = clamp(safeNumber(deltaMs, 0), 0, 100);
      this.events = [];
      this.elapsed += dt;
      this.brakeRemaining = Math.max(0, this.brakeRemaining - dt);
      this.invulnerableRemaining = Math.max(0, this.invulnerableRemaining - dt);
      const ramp = clamp(this.elapsed / 90000, 0, 1);
      const targetSpeed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * ramp;
      this.speed = this.brakeRemaining > 0 ? Math.max(32, targetSpeed * 0.55) : targetSpeed;
      this.distance += this.speed * (dt / 3600000);
      this.score = Math.floor(this.distance * 1000) + this.pickupScore;

      const flow = (0.00018 + ramp * 0.00012) * this.speed / BASE_SPEED;
      for (const entity of this.entities) entity.y += flow * dt;
      this.resolveCollisions();
      this.entities = this.entities.filter(function (entity) { return !entity.resolved && entity.y < 1.2; });

      this.spawnRemaining -= dt;
      if (this.spawnRemaining <= 0) {
        this.spawn();
        const baseInterval = 1050 - ramp * 500;
        this.spawnRemaining = baseInterval * (0.75 + this.random() * 0.5);
      }
      return this.events.slice();
    }
  }

  class SoundEngine {
    constructor() { this.context = null; this.engine = null; this.gain = null; this.muted = false; }
    ensure() {
      if (this.context) { if (this.context.state === "suspended") this.context.resume().catch(function () {}); return true; }
      const AudioContext = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AudioContext) return false;
      try {
        this.context = new AudioContext();
        this.gain = this.context.createGain(); this.gain.gain.value = 0.045; this.gain.connect(this.context.destination);
        this.engine = this.context.createOscillator(); this.engine.type = "sawtooth"; this.engine.frequency.value = 52;
        this.engine.connect(this.gain); this.engine.start(); return true;
      } catch (_) { this.context = null; return false; }
    }
    setMuted(value) { this.muted = Boolean(value); if (this.gain && this.context) this.gain.gain.setTargetAtTime(this.muted ? 0 : 0.045, this.context.currentTime, 0.03); }
    update(speed, active) {
      if (!this.context || !this.engine || !this.gain) return;
      const now = this.context.currentTime;
      this.engine.frequency.setTargetAtTime(42 + speed * 0.55, now, 0.08);
      this.gain.gain.setTargetAtTime(this.muted || !active ? 0 : 0.045, now, 0.08);
    }
    blip(kind) {
      if (this.muted || !this.ensure()) return;
      try {
        const osc = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime;
        osc.type = kind === "crash" ? "square" : "sine"; osc.frequency.setValueAtTime(kind === "crash" ? 95 : 520, now);
        osc.frequency.exponentialRampToValueAtTime(kind === "crash" ? 35 : 880, now + 0.14);
        gain.gain.setValueAtTime(kind === "crash" ? 0.16 : 0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain); gain.connect(this.context.destination); osc.start(now); osc.stop(now + 0.2);
      } catch (_) { /* Sound is optional. */ }
    }
  }

  function drawGame(context, model, width, height, timestamp) {
    const ctx = context, roadLeft = width * 0.08, roadWidth = width * 0.84;
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, "#06101a"); sky.addColorStop(1, "#020304");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#090d10"; ctx.fillRect(roadLeft, 0, roadWidth, height);
    ctx.strokeStyle = "rgba(0,217,232,.55)"; ctx.lineWidth = Math.max(2, width * 0.008); ctx.strokeRect(roadLeft, 0, roadWidth, height);
    ctx.setLineDash([height * 0.045, height * 0.04]); ctx.lineDashOffset = (timestamp * model.speed * 0.00018) % (height * 0.085);
    ctx.strokeStyle = "rgba(217,164,0,.42)"; ctx.lineWidth = Math.max(1, width * 0.004);
    for (let lane = 1; lane < LANES; lane++) { const x = roadLeft + roadWidth * lane / LANES; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    ctx.setLineDash([]);

    function pointX(normalized) { return roadLeft + normalized * roadWidth; }
    for (const entity of model.entities) {
      const x = pointX(entity.x), y = entity.y * height, w = entity.width * roadWidth, h = entity.height * height;
      ctx.save(); ctx.translate(x, y); ctx.shadowBlur = width * 0.04;
      if (entity.type === "car") {
        ctx.shadowColor = "#ff4e68"; ctx.strokeStyle = "#ff4e68"; ctx.fillStyle = "#241018"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.15); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#00d9e8"; ctx.fillRect(-w * 0.28, -h * 0.3, w * 0.56, h * 0.2);
      } else if (entity.type === "barrier") {
        ctx.shadowColor = "#d9a400"; ctx.fillStyle = "#d9a400"; ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = "#17191a"; for (let i = -2; i <= 2; i += 2) ctx.fillRect(i * w / 6, -h / 2, w / 7, h);
      } else if (entity.type === "cone") {
        ctx.shadowColor = "#ff7b39"; ctx.fillStyle = "#ff7b39"; ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill();
      } else if (entity.type === "fuel") {
        ctx.shadowColor = "#00d9e8"; ctx.strokeStyle = "#00d9e8"; ctx.fillStyle = "#082a31"; ctx.lineWidth = 3; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = "#d9a400"; ctx.fillRect(-w * 0.09, -h * 0.3, w * 0.18, h * 0.6);
      } else {
        ctx.shadowColor = "#d9a400"; ctx.strokeStyle = "#d9a400"; ctx.lineWidth = Math.max(3, w * 0.13); ctx.beginPath(); ctx.arc(0, -h * 0.18, w * 0.22, 0, Math.PI * 2); ctx.moveTo(-w * 0.34, h * 0.4); ctx.lineTo(w * 0.2, -h * 0.1); ctx.stroke();
      }
      ctx.restore();
    }

    const px = pointX(laneCenter(model.lane)), py = PLAYER_Y * height, pw = roadWidth * 0.14, ph = height * 0.15;
    if (model.invulnerableRemaining <= 0 || Math.floor(model.invulnerableRemaining / 100) % 2 === 0) {
      ctx.save(); ctx.translate(px, py); ctx.shadowColor = "#00d9e8"; ctx.shadowBlur = width * 0.06; ctx.strokeStyle = "#00d9e8"; ctx.fillStyle = "#071519"; ctx.lineWidth = Math.max(2, width * 0.008);
      ctx.beginPath(); ctx.ellipse(0, ph * 0.34, pw * 0.23, ph * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -ph * 0.34, pw * 0.23, ph * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#d9a400"; ctx.beginPath(); ctx.moveTo(0, ph * 0.25); ctx.lineTo(-pw * 0.26, -ph * 0.1); ctx.lineTo(0, -ph * 0.35); ctx.lineTo(pw * 0.26, -ph * 0.1); ctx.lineTo(0, ph * 0.25); ctx.stroke(); ctx.restore();
    }
  }

  function createBrowserGame(documentRef, windowRef) {
    const doc = documentRef || (typeof document !== "undefined" ? document : null);
    const win = windowRef || (typeof window !== "undefined" ? window : null);
    if (!doc || !win) return null;
    const canvas = doc.getElementById("game-canvas") || doc.getElementById("neon-run-canvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d"), model = new NeonRunModel(), sound = new SoundEngine();
    let raf = 0, last = 0, scores = loadScores(win.localStorage), touchStart = null;
    const el = function (id) { return doc.getElementById(id); };
    const panels = { menu: el("arcade-menu"), game: el("game-stage") || el("arcade-game") };

    function show(which) { Object.keys(panels).forEach(function (key) { if (panels[key]) panels[key].hidden = key !== which; }); }
    function text(id, value) { const node = el(id); if (node) node.textContent = value; }
    function renderScores() {
      [el("arcade-high-score-body") || el("game-high-scores"), el("game-over-score-body")].filter(Boolean).forEach(function (body) {
        body.replaceChildren();
        scores.forEach(function (entry, index) {
          const row = doc.createElement("tr");
          [index + 1, entry.score.toLocaleString(), entry.distance.toFixed(2) + " mi", new Date(entry.date).toLocaleDateString()].forEach(function (value) { const cell = doc.createElement("td"); cell.textContent = value; row.appendChild(cell); });
          body.appendChild(row);
        });
        if (!scores.length) {
          const row = doc.createElement("tr"), cell = doc.createElement("td");
          cell.colSpan = 4; cell.textContent = "No runs logged yet."; row.appendChild(cell); body.appendChild(row);
        }
      });
      const empty = el("game-no-scores"); if (empty) empty.hidden = scores.length > 0;
      text("game-menu-best", scores.length ? scores[0].score.toLocaleString() : "0");
    }
    function resize() {
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, win.devicePixelRatio || 1);
      const width = Math.max(280, Math.round(rect.width * dpr)), height = Math.max(420, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    }
    function updateHud() {
      text(el("hud-speed") ? "hud-speed" : "game-speed", Math.round(model.speed));
      text(el("hud-distance") ? "hud-distance" : "game-distance", model.distance.toFixed(2));
      text(el("hud-score") ? "hud-score" : "game-score", model.score.toLocaleString());
      const livesId = el("hud-lives") ? "hud-lives" : "game-lives";
      text(livesId, "♥".repeat(model.lives) + "♡".repeat(3 - model.lives));
      const livesNode = el(livesId); if (livesNode) livesNode.setAttribute("aria-label", model.lives + (model.lives === 1 ? " life" : " lives"));
    }
    function finish() {
      scores = saveScore(win.localStorage, { score: model.score, distance: model.distance, date: new Date().toISOString() });
      text(el("final-score") ? "final-score" : "game-final-score", model.score.toLocaleString());
      text(el("final-distance") ? "final-distance" : "game-final-distance", model.distance.toFixed(2) + " mi");
      text(el("final-best") ? "final-best" : "game-final-best", (scores[0] ? scores[0].score : model.score).toLocaleString());
      renderScores(); show("game"); const overlay = el("game-over-overlay"); if (overlay) overlay.hidden = false; sound.update(0, false);
    }
    function loop(timestamp) {
      if (!last) last = timestamp; const delta = timestamp - last; last = timestamp;
      if (model.running && !model.paused) {
        const events = model.update(delta);
        events.forEach(function (event) { if (event.type === "pickup") sound.blip("pickup"); if (event.type === "crash") sound.blip("crash"); });
        if (model.gameOver) finish();
      }
      resize(); drawGame(ctx, model, canvas.width, canvas.height, timestamp); updateHud(); sound.update(model.speed, model.running && !model.paused);
      raf = win.requestAnimationFrame(loop);
    }
    function start() { sound.ensure(); model.start(); last = 0; const pause = el("game-pause-overlay") || el("arcade-pause-overlay"); if (pause) pause.hidden = true; const over = el("game-over-overlay"); if (over) over.hidden = true; show("game"); }
    function pause() { if (model.pause()) { const overlay = el("game-pause-overlay") || el("arcade-pause-overlay"); if (overlay) overlay.hidden = false; sound.update(model.speed, false); } }
    function resume() { model.resume(); last = 0; const overlay = el("game-pause-overlay") || el("arcade-pause-overlay"); if (overlay) overlay.hidden = true; sound.ensure(); }
    function quit() { model.reset(); const overlay = el("game-pause-overlay") || el("arcade-pause-overlay"); if (overlay) overlay.hidden = true; const over = el("game-over-overlay"); if (over) over.hidden = true; show("menu"); renderScores(); }
    function bind(id, eventName, handler) { const node = el(id); if (node) node.addEventListener(eventName || "click", handler); }
    bind(el("arcade-start") ? "arcade-start" : "game-start", "click", start); bind("game-play-again", "click", start); bind("game-restart", "click", start);
    bind("game-pause", "click", pause); bind("game-resume", "click", resume); bind("game-quit", "click", quit); bind(el("game-over-quit") ? "game-over-quit" : "game-over-menu", "click", quit);
    bind("game-left", "click", function () { model.move(-1); }); bind("game-right", "click", function () { model.move(1); }); bind("game-brake", "click", function () { model.brake(); });
    bind(el("arcade-mute") ? "arcade-mute" : "game-mute", "click", function (event) { sound.setMuted(!sound.muted); event.currentTarget.setAttribute("aria-pressed", String(sound.muted)); event.currentTarget.textContent = sound.muted ? "Sound off" : "Sound on"; });
    doc.addEventListener("keydown", function (event) {
      if (!el("view-arcade") || el("view-arcade").hidden) return;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", " "].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowLeft") model.move(-1); else if (event.key === "ArrowRight") model.move(1); else if (event.key === "ArrowDown") model.brake();
      else if (event.key.toLowerCase() === "p") model.paused ? resume() : pause(); else if (event.key === " " && (!model.running || model.gameOver)) start();
    });
    canvas.addEventListener("touchstart", function (event) { const touch = event.changedTouches[0]; touchStart = { x: touch.clientX, y: touch.clientY }; }, { passive: true });
    canvas.addEventListener("touchend", function (event) { if (!touchStart) return; const touch = event.changedTouches[0], dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y; if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) model.move(dx < 0 ? -1 : 1); touchStart = null; }, { passive: true });
    win.addEventListener("resize", resize);
    doc.addEventListener("visibilitychange", function () { if (doc.hidden && model.running && !model.paused) pause(); });
    renderScores(); resize(); drawGame(ctx, model, canvas.width, canvas.height, 0); raf = win.requestAnimationFrame(loop);
    return { model: model, start: start, pause: pause, resume: resume, quit: quit, destroy: function () { win.cancelAnimationFrame(raf); } };
  }

  function autoInit() {
    if (typeof document === "undefined") return;
    const init = function () { if (!document.documentElement.dataset.neonRunReady) { const game = createBrowserGame(document, window); if (game) { document.documentElement.dataset.neonRunReady = "true"; window.neonRunGame = game; } } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
  autoInit();

  return {
    SCORE_KEY: SCORE_KEY, ENTITY_TYPES: ENTITY_TYPES, NeonRunModel: NeonRunModel,
    overlaps: overlaps, checkCollision: checkCollision, createInitialState: createInitialState,
    changeLane: changeLane, stepState: stepState, resolveCollision: resolveCollision,
    orderScores: orderScores, normalizeHighScores: orderScores,
    loadScores: loadScores, loadHighScores: loadScores,
    saveScore: saveScore, saveHighScore: saveScore,
    drawGame: drawGame, createBrowserGame: createBrowserGame
  };
});
