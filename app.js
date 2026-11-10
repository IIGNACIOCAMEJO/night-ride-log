(function (global) {
  "use strict";

  const Storage = global.NightRideStorage;
  const Rides = global.NightRideRides;
  const Stats = global.NightRideStats;
  const views = new Set(["dashboard", "rides", "stats", "garage", "arcade", "settings"]);
  let state;
  let pendingConfirmation = null;
  const API = global.NightRideAPI;

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { const node = byId(id); if (node) node.textContent = value; }
  function miles(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
  function hours(minutes) { return (Number(minutes || 0) / 60).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function showFormError(id, error) { const node = byId(id); if (!node) return; node.textContent = error && error.message ? error.message : String(error); node.hidden = false; node.focus(); }

  function toast(message, error) {
    const region = byId("toast-region");
    if (!region) return;
    const item = document.createElement("div");
    item.className = "toast" + (error ? " is-error" : "");
    item.textContent = message;
    region.appendChild(item);
    global.setTimeout(function () { item.remove(); }, 3600);
  }

  function showDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function confirmAction(message, label) {
    const dialog = byId("confirm-dialog");
    setText("confirm-message", message);
    setText("confirm-action-button", label || "Confirm");
    showDialog(dialog);
    return new Promise(function (resolve) { pendingConfirmation = resolve; });
  }

  function currentView() {
    const name = global.location.hash.replace(/^#/, "");
    return views.has(name) ? name : "dashboard";
  }

  function route() {
    const active = currentView();
    if (active !== "arcade" && global.neonRunGame && global.neonRunGame.model.running && !global.neonRunGame.model.paused) {
      global.neonRunGame.pause();
    }
    document.querySelectorAll("[data-view]").forEach(function (section) {
      const selected = section.dataset.view === active;
      section.hidden = !selected;
      section.classList.toggle("is-active", selected);
    });
    document.querySelectorAll("[data-view-link]").forEach(function (link) {
      const selected = link.dataset.viewLink === active;
      link.classList.toggle("is-active", selected);
      if (selected) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (active === "stats") global.requestAnimationFrame(renderStats);
    global.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderDashboard() {
    const summary = Stats.calculateSummary(state.rides);
    setText("metric-total-rides", summary.totalRides);
    setText("metric-total-miles", miles(summary.totalMiles));
    setText("metric-total-hours", hours(summary.totalMinutes));
    setText("metric-longest-ride", miles(summary.longestRide));
    setText("month-label", new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date()));
    setText("month-rides", summary.thisMonth.rides);
    setText("month-miles", miles(summary.thisMonth.miles));
    setText("month-hours", hours(summary.thisMonth.minutes));

    const split = Stats.dayNightSplit(state.rides);
    const trackedMiles = split.night.miles + split.day.miles;
    const nightShare = trackedMiles ? Math.round(split.night.miles / trackedMiles * 100) : 0;
    const averageMiles = summary.totalRides ? summary.totalMiles / summary.totalRides : 0;
    const primaryBike = Stats.milesByBike(state.rides, state.bikes).filter(function (bike) { return bike.rides > 0; })[0];
    setText("signal-night-share", nightShare + "%");
    setText("signal-average-miles", miles(averageMiles));
    setText("signal-primary-bike", primaryBike ? primaryBike.name : "No rides yet");

    const recent = byId("recent-rides");
    recent.replaceChildren();
    const bikeMap = new Map(state.bikes.map(function (bike) { return [bike.id, bike.name]; }));
    state.rides.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 4).forEach(function (ride) {
      const item = document.createElement("article");
      item.className = "compact-ride";
      const title = document.createElement("strong");
      title.textContent = ride.route;
      const meta = document.createElement("span");
      meta.textContent = Rides.formatDate(ride.date) + " · " + (bikeMap.get(ride.bikeId) || "Unknown bike");
      const distance = document.createElement("span");
      distance.className = "ride-distance";
      distance.textContent = miles(ride.miles) + " mi";
      item.append(title, meta, distance);
      recent.appendChild(item);
    });
    if (!recent.children.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No rides logged yet.";
      recent.appendChild(empty);
    }
  }

  function renderStats() {
    Stats.renderMonthlyChart(state.rides);
    Stats.renderBikeMiles(state.rides, state.bikes, "bike-mileage-stats");
    const split = Stats.dayNightSplit(state.rides);
    const total = split.night.miles + split.day.miles;
    const percent = total ? Math.round(split.night.miles / total * 100) : 0;
    const chart = byId("time-split-chart");
    chart.style.setProperty("--night-percent", percent + "%");
    chart.dataset.label = percent + "%\nnight miles";
    const legend = byId("time-split-legend");
    legend.replaceChildren();
    [["Night", split.night, "var(--yellow)"], ["Day", split.day, "var(--cyan)"]].forEach(function (entry) {
      const item = document.createElement("span");
      item.className = "legend-item";
      item.style.setProperty("--legend-color", entry[2]);
      item.textContent = entry[0] + ": " + miles(entry[1].miles) + " mi · " + entry[1].rides + " rides";
      legend.appendChild(item);
    });
    chart.setAttribute("aria-label", "Night rides are " + percent + " percent of total mileage");
  }

  function renderGarage() {
    const list = byId("bike-list");
    list.replaceChildren();
    const totals = Stats.milesByBike(state.rides, state.bikes);
    const totalMap = new Map(totals.map(function (item) { return [item.id, item]; }));
    state.bikes.forEach(function (bike) {
      const total = totalMap.get(bike.id) || { miles: 0, rides: 0 };
      const card = document.createElement("article");
      card.className = "bike-card";
      card.style.setProperty("--bike-color", /^#[0-9a-f]{6}$/i.test(bike.color) ? bike.color : "var(--cyan)");
      const title = document.createElement("h2"); title.textContent = bike.name;
      const model = document.createElement("p"); model.className = "bike-model"; model.textContent = [bike.year, bike.make, bike.model].filter(Boolean).join(" ");
      const numbers = document.createElement("div"); numbers.className = "bike-totals";
      numbers.innerHTML = "<div><strong>" + miles(total.miles) + "</strong><span>logged miles</span></div><div><strong>" + total.rides + "</strong><span>rides</span></div>";
      const actions = document.createElement("div"); actions.className = "card-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button"; edit.dataset.action = "edit-bike"; edit.dataset.bikeId = bike.id; edit.textContent = "Edit";
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button-danger"; remove.dataset.action = "delete-bike"; remove.dataset.bikeId = bike.id; remove.textContent = "Delete";
      actions.append(edit, remove); card.append(title, model, numbers, actions); list.appendChild(card);
    });
    if (!state.bikes.length) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "No bikes in the garage."; list.appendChild(empty);
    }
  }

  function renderAll() {
    state = Storage.getState();
    Rides.populateBikeOptions(state);
    Rides.renderList(state);
    renderDashboard();
    renderGarage();
    renderStats();
  }

  function openRide(id) {
    const form = byId("ride-form");
    Rides.populateBikeOptions(state, form);
    if (id) {
      const ride = Rides.findRide(id, state);
      if (!ride) return;
      Rides.fillForm(form, ride);
      setText("ride-dialog-title", "Edit ride");
    } else {
      if (!state.bikes.length) { toast("Add a bike before logging a ride.", true); global.location.hash = "garage"; return; }
      Rides.resetForm(form);
      setText("ride-dialog-title", "Log a ride");
    }
    byId("ride-form-error").hidden = true;
    showDialog(byId("ride-dialog"));
  }

  function bikeFromForm(form) {
    const data = new FormData(form);
    return Storage.normalizeBike({
      id: String(data.get("id") || "") || Storage.makeId("bike"),
      name: data.get("name"), make: data.get("make"), model: data.get("model"),
      year: data.get("year") || new Date().getFullYear(), odometer: data.get("odometer") || 0, color: data.get("color")
    }, { strict: true });
  }

  function openBike(id) {
    const form = byId("bike-form"); form.reset();
    const bike = state.bikes.find(function (item) { return item.id === id; });
    [["bike-id", bike && bike.id], ["bike-name", bike && bike.name], ["bike-make", bike && bike.make], ["bike-model", bike && bike.model], ["bike-year", bike && bike.year], ["bike-odometer", bike && bike.odometer], ["bike-color", bike && /^#[0-9a-f]{6}$/i.test(bike.color) ? bike.color : "#00d9e8"]].forEach(function (entry) { if (entry[1] != null) byId(entry[0]).value = entry[1]; });
    setText("bike-dialog-title", bike ? "Edit bike" : "Add bike");
    byId("bike-form-error").hidden = true;
    showDialog(byId("bike-dialog"));
  }

  function downloadData() {
    const blob = new Blob([Storage.exportJSON()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "night-ride-log-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
    toast("Ride archive exported.");
  }

  document.addEventListener("click", async function (event) {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const name = action.dataset.action;
    if (name === "new-ride") openRide();
    if (name === "edit-ride") openRide(action.dataset.rideId);
    if (name === "close-ride-dialog") closeDialog(byId("ride-dialog"));
    if (name === "new-bike") openBike();
    if (name === "edit-bike") openBike(action.dataset.bikeId);
    if (name === "close-bike-dialog") closeDialog(byId("bike-dialog"));
    if (name === "close-account-dialog") closeDialog(byId("account-dialog"));
    if (name === "delete-ride") {
      if (await confirmAction("Delete this ride permanently?", "Delete ride")) { Storage.deleteRide(action.dataset.rideId); toast("Ride deleted."); }
    }
    if (name === "delete-bike") {
      if (await confirmAction("Delete this bike? Bikes with linked rides cannot be removed.", "Delete bike")) {
        try { Storage.deleteBike(action.dataset.bikeId); toast("Bike deleted."); } catch (error) { toast(error.message, true); }
      }
    }
  });

  byId("confirm-dialog").addEventListener("close", function (event) {
    if (pendingConfirmation) { pendingConfirmation(event.target.returnValue === "confirm"); pendingConfirmation = null; }
  });

  byId("ride-form").addEventListener("submit", function (event) {
    event.preventDefault();
    try { const ride = Rides.saveForm(event.currentTarget); closeDialog(byId("ride-dialog")); toast(ride.route + " saved."); }
    catch (error) { showFormError("ride-form-error", error); }
  });

  byId("bike-form").addEventListener("submit", function (event) {
    event.preventDefault();
    try { const bike = bikeFromForm(event.currentTarget); Storage.upsertBike(bike); closeDialog(byId("bike-dialog")); toast(bike.name + " saved."); }
    catch (error) { showFormError("bike-form-error", error); }
  });

  Rides.bindFilters(function () { Rides.renderList(state); });
  byId("export-data-button").addEventListener("click", downloadData);
  byId("import-data-input").addEventListener("change", async function (event) {
    const file = event.target.files[0]; if (!file) return;
    try { Storage.importJSON(await file.text()); toast("Archive imported."); }
    catch (error) { toast(error.message, true); }
    event.target.value = "";
  });
  byId("reset-data-button").addEventListener("click", async function () { if (await confirmAction("Replace local data with the original sample rides?", "Reset data")) { Storage.resetToSeed(); toast("Seed data restored."); } });
  byId("clear-data-button").addEventListener("click", async function () { if (await confirmAction("Delete every local ride and bike? This cannot be undone.", "Clear everything")) { Storage.clearAll(); toast("All local data cleared."); } });
  function renderAccount(status) {
    const mode = status.mode || "local";
    const shell = document.querySelector(".system-status");
    if (shell) shell.dataset.mode = mode;
    setText("sync-status", mode === "synced" ? "SYNCED" : mode === "api" ? "API READY" : "LOCAL");
    setText("account-button", status.user ? status.user.username : "Sign in");
    byId("account-auth-actions").hidden = Boolean(status.user);
    byId("account-user-actions").hidden = !status.user;
    byId("account-username").disabled = Boolean(status.user);
    byId("account-password").disabled = Boolean(status.user);
    setText("account-copy", status.user ? "Signed in as " + status.user.username + ". Your rides and garage sync through this server." : (status.online ? "Sign in to sync your private rides between devices." : "The API is offline. Local mode remains fully available."));
  }
  byId("account-button").addEventListener("click", function () { renderAccount(API.status()); showDialog(byId("account-dialog")); });
  byId("account-form").addEventListener("submit", async function (event) {
    event.preventDefault(); const errorNode = byId("account-error"); errorNode.hidden = true;
    try { await API.login(byId("account-username").value.trim(), byId("account-password").value); closeDialog(byId("account-dialog")); toast("Account connected and rides synced."); }
    catch (error) { showFormError("account-error", error); }
  });
  byId("register-button").addEventListener("click", async function () {
    const errorNode = byId("account-error"); errorNode.hidden = true;
    if (!byId("account-form").reportValidity()) return;
    try { await API.register(byId("account-username").value.trim(), byId("account-password").value); closeDialog(byId("account-dialog")); toast("Account created and rides synced."); }
    catch (error) { showFormError("account-error", error); }
  });
  byId("logout-button").addEventListener("click", async function () { await API.logout(); closeDialog(byId("account-dialog")); toast("Signed out. Local data remains on this device."); });
  API.subscribe(renderAccount);
  global.addEventListener("night-ride-sync-error", function (event) { toast("Sync paused: " + event.detail.message, true); });
  global.addEventListener("hashchange", route);
  Storage.subscribe(function (next) { state = next; renderAll(); });

  state = Storage.load(); renderAll(); route(); API.bootstrap();
  if ("serviceWorker" in navigator && global.location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(function (error) { console.warn("Offline cache unavailable.", error); });
})(window);
