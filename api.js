(function (global) {
  "use strict";

  const TOKEN_KEY = "nightRideLog.apiToken.v1";
  const OWNER_KEY = "nightRideLog.localOwner.v1";
  const listeners = new Set();
  let online = false;
  let user = null;
  let hydrating = false;
  let token = "";
  try { global.localStorage.removeItem(TOKEN_KEY); } catch (error) { console.warn(error); }

  function emit() {
    const detail = { online: online, user: user, authenticated: Boolean(user), mode: online ? (user ? "synced" : "api") : "local" };
    listeners.forEach(function (listener) { listener(detail); });
    global.dispatchEvent(new CustomEvent("night-ride-api-status", { detail: detail }));
  }

  async function request(path, options) {
    const settings = options || {};
    const headers = Object.assign({ Accept: "application/json" }, settings.headers || {});
    if (settings.body != null && !(settings.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    let response;
    try { response = await global.fetch(path, Object.assign({}, settings, { headers: headers, credentials: "same-origin" })); }
    catch (error) { online = false; emit(); throw error; }
    online = true;
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      if (response.status === 401 && !path.endsWith("/login")) { setToken(""); user = null; emit(); }
      const error = new Error(payload && (payload.error || payload.message) || "Request failed (" + response.status + ")");
      error.status = response.status; error.payload = payload; throw error;
    }
    return payload;
  }

  async function detect() {
    try {
      await request("/api/health", { method: "GET" });
      try { const result = await request("/api/auth/me"); user = result.user || result; } catch (error) { if (error.status === 401) { setToken(""); user = null; } else throw error; }
    } catch (error) { online = false; }
    emit(); return online;
  }

  function setToken(value) {
    token = value || "";
    try { global.localStorage.removeItem(TOKEN_KEY); } catch (error) { console.warn(error); }
  }

  function localOwner() { try { return global.localStorage.getItem(OWNER_KEY) || ""; } catch (_) { return ""; } }
  function setLocalOwner(value) { try { if (value) global.localStorage.setItem(OWNER_KEY, value); else global.localStorage.removeItem(OWNER_KEY); } catch (error) { console.warn(error); } }

  async function authenticate(kind, username, password) {
    const result = await request("/api/auth/" + kind, { method: "POST", body: JSON.stringify({ username: username, password: password }) });
    setToken(result.token || result.sessionToken || "");
    user = result.user || { username: username };
    emit(); await refresh({ uploadIfEmpty: !localOwner() || localOwner().toLocaleLowerCase() === String(user.username || username).toLocaleLowerCase() }); return user;
  }

  async function logout() {
    try { if (online && user) await request("/api/auth/logout", { method: "POST" }); } catch (error) { console.warn(error); }
    setToken(""); user = null; emit();
  }

  function unwrapList(payload, key) { return Array.isArray(payload) ? payload : (payload && Array.isArray(payload[key]) ? payload[key] : []); }

  async function refresh(options) {
    if (!online || !user || !global.NightRideStorage) return null;
    const results = await Promise.all([request("/api/bikes"), request("/api/rides")]);
    const remote = { version: global.NightRideStorage.VERSION, bikes: unwrapList(results[0], "bikes"), rides: unwrapList(results[1], "rides") };
    const local = global.NightRideStorage.getState();
    if (!remote.bikes.length && !remote.rides.length && options && options.uploadIfEmpty && (local.bikes.length || local.rides.length)) {
      for (const bike of local.bikes) await sync("bike", "upsert", bike);
      for (const ride of local.rides) await sync("ride", "upsert", ride);
      setLocalOwner(user.username);
      return local;
    }
    hydrating = true;
    try { global.NightRideStorage.save(remote); setLocalOwner(user.username); } finally { hydrating = false; }
    return remote;
  }

  async function sync(kind, action, recordOrId) {
    if (!online || !user || hydrating) return null;
    const plural = kind === "bike" ? "bikes" : "rides";
    if (action === "delete") return request("/api/" + plural + "/" + encodeURIComponent(recordOrId), { method: "DELETE" });
    const record = recordOrId;
    try {
      return await request("/api/" + plural + "/" + encodeURIComponent(record.id), { method: "PUT", body: JSON.stringify(record) });
    } catch (error) {
      if (error.status !== 404 && error.status !== 405) throw error;
      return request("/api/" + plural, { method: "POST", body: JSON.stringify(record) });
    }
  }

  function queue(kind, action, value) {
    if (!online || !user || hydrating) return Promise.resolve(null);
    return sync(kind, action, value).catch(function (error) {
      console.warn("Sync deferred; the local copy is safe.", error);
      global.dispatchEvent(new CustomEvent("night-ride-sync-error", { detail: { message: error.message } }));
      return null;
    });
  }

  async function bootstrap() { await detect(); if (user) { try { await refresh({ uploadIfEmpty: localOwner().toLocaleLowerCase() === String(user.username || "").toLocaleLowerCase() }); } catch (error) { console.warn("Remote data could not be loaded; using local data.", error); } } return status(); }
  function status() { return { online: online, user: user, authenticated: Boolean(user), mode: online ? (user ? "synced" : "api") : "local" }; }
  function subscribe(listener) { listeners.add(listener); listener(status()); return function () { listeners.delete(listener); }; }

  global.NightRideAPI = Object.freeze({ bootstrap: bootstrap, detect: detect, refresh: refresh, request: request, queue: queue, login: function (u, p) { return authenticate("login", u, p); }, register: function (u, p) { return authenticate("register", u, p); }, logout: logout, status: status, subscribe: subscribe });
})(window);
