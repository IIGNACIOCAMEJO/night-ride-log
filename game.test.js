"use strict";

const assert = require("node:assert/strict");
const NeonRun = require("./game.js");

function test(name, callback) {
  try {
    callback();
    console.log("✓ " + name);
  } catch (error) {
    console.error("✗ " + name);
    throw error;
  }
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

test("lane changes stay within the three-lane road", function () {
  const state = NeonRun.createInitialState({ random: function () { return 0.99; } });
  assert.equal(state.lane, 1);
  NeonRun.changeLane(state, -1);
  assert.equal(state.lane, 0);
  NeonRun.changeLane(state, -1);
  assert.equal(state.lane, 0);
  NeonRun.changeLane(state, 1);
  NeonRun.changeLane(state, 1);
  NeonRun.changeLane(state, 1);
  assert.equal(state.lane, 2);
});

test("collision detection distinguishes overlapping and separated boxes", function () {
  const player = { x: 0.5, y: 0.8, width: 0.14, height: 0.15 };
  assert.equal(NeonRun.checkCollision(player, { x: 0.5, y: 0.8, width: 0.1, height: 0.1 }), true);
  assert.equal(NeonRun.checkCollision(player, { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }), false);
});

test("pickups award their bonus and fuel also adds distance", function () {
  const state = NeonRun.createInitialState();
  const initialDistance = state.distance;
  const fuel = state.addEntity("fuel", state.lane, 0);
  NeonRun.resolveCollision(state, fuel);
  assert.equal(state.pickupScore, 175);
  assert.ok(state.distance > initialDistance, "fuel should add a small distance bonus");

  const wrench = state.addEntity("wrench", state.lane, 0);
  NeonRun.resolveCollision(state, wrench);
  assert.equal(state.pickupScore, 475);
  assert.equal(state.score, Math.floor(state.distance * 1000) + 475);
});

test("a crash removes one life and invulnerability prevents a double hit", function () {
  const state = NeonRun.createInitialState();
  const first = state.addEntity("car", state.lane, 0);
  NeonRun.resolveCollision(state, first);
  assert.equal(state.lives, 2);
  assert.ok(state.invulnerableRemaining > 0);

  const second = state.addEntity("barrier", state.lane, 0);
  NeonRun.resolveCollision(state, second);
  assert.equal(state.lives, 2, "a second overlapping obstacle must not consume another life during invulnerability");

  while (state.invulnerableRemaining > 0) NeonRun.stepState(state, 100);
  assert.equal(state.invulnerableRemaining, 0);
  const third = state.addEntity("cone", state.lane, 0);
  NeonRun.resolveCollision(state, third);
  assert.equal(state.lives, 1);
});

test("time steps accumulate distance and distance-based score", function () {
  const state = NeonRun.createInitialState({ random: function () { return 0.99; } });
  NeonRun.stepState(state, 100);
  const firstDistance = state.distance;
  const firstScore = state.score;
  NeonRun.stepState(state, 100);
  assert.ok(firstDistance > 0);
  assert.ok(state.distance > firstDistance);
  assert.ok(state.score > firstScore);
  assert.equal(state.score, Math.floor(state.distance * 1000) + state.pickupScore);
});

test("high scores persist under their own key in top-ten order", function () {
  const storage = memoryStorage();
  const dates = ["2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z"];
  NeonRun.saveHighScore(storage, { score: 100, distance: 1.5, date: dates[0] });
  NeonRun.saveHighScore(storage, { score: 900, distance: 4.2, date: dates[1] });
  NeonRun.saveHighScore(storage, { score: 500, distance: 3.1, date: dates[2] });
  const scores = NeonRun.loadHighScores(storage);
  assert.deepEqual(scores.map(function (entry) { return entry.score; }), [900, 500, 100]);
  assert.equal(scores[0].distance, 4.2);
  assert.ok(storage.getItem(NeonRun.SCORE_KEY));
  assert.equal(storage.getItem("nightRideLog.data"), null, "the game must not write ride data");

  for (let score = 0; score < 12; score += 1) {
    NeonRun.saveHighScore(storage, { score: 2000 + score, distance: score, date: dates[0] });
  }
  const topTen = NeonRun.loadHighScores(storage);
  assert.equal(topTen.length, 10);
  assert.ok(topTen.every(function (entry, index) { return index === 0 || topTen[index - 1].score >= entry.score; }));
});

console.log("NEON RUN headless logic tests passed.");
