(function (global) {
  "use strict";

  const STORAGE_KEY = "nightRideLog.data.v1";
  const VERSION = global.NightRideSeed ? global.NightRideSeed.SCHEMA_VERSION : 1;
  const listeners = new Set();
  let memoryState = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value, fallback) {
    return typeof value === "string" ? value.trim() : (fallback || "");
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function makeId(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return prefix + "-" + global.crypto.randomUUID();
    }
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function normalizeBike(input, options) {
    const source = input && typeof input === "object" ? input : {};
    const strict = options && options.strict;
    const bike = {
      id: text(source.id) || makeId("bike"),
      name: text(source.name),
      year: Math.round(finiteNumber(source.year, new Date().getFullYear())),
      make: text(source.make),
      model: text(source.model),
      color: text(source.color),
      odometer: Math.max(0, finiteNumber(source.odometer, 0))
    };
    if (strict && !bike.name) throw new Error("Every bike needs a name.");
    if (bike.year < 1885 || bike.year > new Date().getFullYear() + 2) {
      if (strict) throw new Error("Bike year is outside the valid range.");
      bike.year = new Date().getFullYear();
    }
    return bike;
  }

  function normalizeRide(input, options) {
    const source = input && typeof input === "object" ? input : {};
    const strict = options && options.strict;
    const periodSource = text(source.period || source.timeOfDay).toLowerCase();
    const ride = {
      id: text(source.id) || makeId("ride"),
      date: text(source.date),
      route: text(source.route || source.routeName),
      start: text(source.start),
      end: text(source.end),
      miles: Math.max(0, finiteNumber(source.miles, 0)),
      duration: Math.max(0, Math.round(finiteNumber(source.duration || source.durationMinutes, 0))),
      bikeId: text(source.bikeId),
      period: periodSource === "day" ? "day" : "night",
      weather: text(source.weather),
      notes: text(source.notes)
    };
    if (strict) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ride.date) || Number.isNaN(Date.parse(ride.date + "T00:00:00"))) {
        throw new Error("Ride date is invalid.");
      }
      if (!ride.route) throw new Error("Every ride needs a route name.");
      if (!ride.bikeId) throw new Error("Every ride must be linked to a bike.");
      if (!(ride.miles > 0)) throw new Error("Ride miles must be greater than zero.");
      if (!(ride.duration > 0)) throw new Error("Ride duration must be greater than zero.");
    }
    return ride;
  }

  function normalizeState(input, options) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Data must be a JSON object.");
    }
    if (!Array.isArray(input.bikes) || !Array.isArray(input.rides)) {
      throw new Error("Data must include bikes and rides arrays.");
    }
    const strict = Boolean(options && options.strict);
    const bikes = input.bikes.map(function (bike) { return normalizeBike(bike, { strict: strict }); });
    const bikeIds = new Set();
    bikes.forEach(function (bike) {
      if (bikeIds.has(bike.id)) throw new Error("Duplicate bike ID: " + bike.id);
      bikeIds.add(bike.id);
    });
    const rideIds = new Set();
    const rides = input.rides.map(function (ride) {
      const normalized = normalizeRide(ride, { strict: strict });
      if (rideIds.has(normalized.id)) throw new Error("Duplicate ride ID: " + normalized.id);
      rideIds.add(normalized.id);
      if (strict && !bikeIds.has(normalized.bikeId)) {
        throw new Error("Ride “" + normalized.route + "” references a missing bike.");
      }
      return normalized;
    });
    return { version: VERSION, bikes: bikes, rides: rides };
  }

  function seedState() {
    if (!global.NightRideSeed) throw new Error("seed.js must load before storage.js.");
    return normalizeState(global.NightRideSeed.createSeedState(), { strict: true });
  }

  function notify(reason) {
    const snapshot = getState();
    listeners.forEach(function (listener) {
      try { listener(snapshot, reason); } catch (error) { console.error(error); }
    });
    global.dispatchEvent(new CustomEvent("night-ride-data", { detail: { state: snapshot, reason: reason } }));
  }

  function write(state, reason) {
    const normalized = normalizeState(state, { strict: true });
    memoryState = normalized;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.warn("Night Ride Log could not persist data; using memory for this session.", error);
    }
    notify(reason || "save");
    return getState();
  }

  function load() {
    if (memoryState) return clone(memoryState);
    let raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (error) { console.warn(error); }
    if (raw) {
      try {
        memoryState = normalizeState(JSON.parse(raw), { strict: true });
        return clone(memoryState);
      } catch (error) {
        console.warn("Stored Night Ride Log data was invalid; seed data was restored.", error);
      }
    }
    memoryState = seedState();
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState)); } catch (error) { console.warn(error); }
    return clone(memoryState);
  }

  function getState() {
    return load();
  }

  function save(state) {
    return write(state, "save");
  }

  function update(mutator, reason) {
    const draft = getState();
    const result = mutator(draft);
    return write(result || draft, reason || "update");
  }

  function upsertRide(ride) {
    const normalized = normalizeRide(ride, { strict: true });
    return update(function (state) {
      if (!state.bikes.some(function (bike) { return bike.id === normalized.bikeId; })) {
        throw new Error("Select an existing bike for this ride.");
      }
      const index = state.rides.findIndex(function (item) { return item.id === normalized.id; });
      if (index >= 0) state.rides[index] = normalized;
      else state.rides.push(normalized);
    }, "ride-upsert");
  }

  function deleteRide(id) {
    return update(function (state) {
      state.rides = state.rides.filter(function (ride) { return ride.id !== id; });
    }, "ride-delete");
  }

  function upsertBike(bike) {
    const normalized = normalizeBike(bike, { strict: true });
    return update(function (state) {
      const index = state.bikes.findIndex(function (item) { return item.id === normalized.id; });
      if (index >= 0) state.bikes[index] = normalized;
      else state.bikes.push(normalized);
    }, "bike-upsert");
  }

  function deleteBike(id) {
    return update(function (state) {
      if (state.rides.some(function (ride) { return ride.bikeId === id; })) {
        throw new Error("This bike has linked rides. Reassign or delete those rides first.");
      }
      state.bikes = state.bikes.filter(function (bike) { return bike.id !== id; });
    }, "bike-delete");
  }

  function exportJSON() {
    return JSON.stringify(getState(), null, 2);
  }

  function importJSON(value) {
    let parsed = value;
    if (typeof value === "string") {
      try { parsed = JSON.parse(value); } catch (error) { throw new Error("That file is not valid JSON."); }
    }
    return write(normalizeState(parsed, { strict: true }), "import");
  }

  function resetToSeed() {
    return write(seedState(), "reset");
  }

  function clearAll() {
    return write({ version: VERSION, bikes: [], rides: [] }, "clear");
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  global.NightRideStorage = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    load: load,
    getState: getState,
    save: save,
    update: update,
    normalizeBike: normalizeBike,
    normalizeRide: normalizeRide,
    normalizeState: normalizeState,
    makeId: makeId,
    upsertRide: upsertRide,
    deleteRide: deleteRide,
    upsertBike: upsertBike,
    deleteBike: deleteBike,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetToSeed: resetToSeed,
    clearAll: clearAll,
    subscribe: subscribe
  });
})(window);
