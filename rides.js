(function (global) {
  "use strict";

  const SELECTORS = Object.freeze({
    list: ["#rides-list", "[data-rides-list]"],
    empty: ["#rides-empty", "[data-rides-empty]"],
    count: ["#rides-count", "[data-rides-count]"],
    search: ["#ride-search", "[data-ride-search]"],
    bikeFilter: ["#ride-bike-filter", "[data-ride-bike-filter]"],
    sort: ["#ride-sort", "[data-ride-sort]"],
    form: ["#ride-form", "[data-ride-form]"]
  });

  function first(root, selectors) {
    const scope = root && typeof root.querySelector === "function" ? root : document;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (let index = 0; index < list.length; index += 1) {
      const match = scope.querySelector(list[index]);
      if (match) return match;
    }
    return null;
  }

  function valueOf(root, names, fallback) {
    const selectors = [];
    names.forEach(function (name) {
      selectors.push("[name=\"" + name + "\"]", "#ride-" + name, "#" + name);
    });
    const control = first(root, selectors);
    if (!control) return fallback == null ? "" : fallback;
    if (control.type === "radio") {
      const checked = first(root, ["[name=\"" + control.name + "\"]:checked"]);
      return checked ? checked.value : (fallback || "");
    }
    return control.value;
  }

  function setValue(root, names, value) {
    const selectors = [];
    names.forEach(function (name) {
      selectors.push("[name=\"" + name + "\"]", "#ride-" + name, "#" + name);
    });
    const controls = root.querySelectorAll(selectors.join(","));
    controls.forEach(function (control) {
      if (control.type === "radio") control.checked = control.value === String(value == null ? "" : value);
      else control.value = value == null ? "" : value;
    });
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>'\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[character];
    });
  }

  function formatDate(date) {
    if (!date) return "Date unknown";
    const parsed = new Date(date + "T12:00:00");
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(parsed);
  }

  function formatDuration(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(total / 60);
    const remainder = total % 60;
    if (!hours) return remainder + " min";
    return hours + "h " + remainder + "m";
  }

  function normalizedSort(sort) {
    const aliases = {
      "date-desc": "date-desc", "newest": "date-desc", "date-new": "date-desc",
      "date-asc": "date-asc", "oldest": "date-asc", "date-old": "date-asc",
      "miles-desc": "miles-desc", "miles-high": "miles-desc",
      "miles-asc": "miles-asc", "miles-low": "miles-asc"
    };
    return aliases[sort] || "date-desc";
  }

  function filterAndSort(rides, options) {
    const settings = options || {};
    const query = String(settings.search || "").trim().toLocaleLowerCase();
    const bikeId = String(settings.bikeId || "");
    const result = (Array.isArray(rides) ? rides : []).filter(function (ride) {
      if (bikeId && bikeId !== "all" && ride.bikeId !== bikeId) return false;
      if (!query) return true;
      return [ride.route, ride.notes, ride.start, ride.end, ride.weather].some(function (field) {
        return String(field || "").toLocaleLowerCase().includes(query);
      });
    });
    const sort = normalizedSort(settings.sort);
    return result.sort(function (a, b) {
      if (sort === "miles-asc") return Number(a.miles) - Number(b.miles) || String(b.date).localeCompare(String(a.date));
      if (sort === "miles-desc") return Number(b.miles) - Number(a.miles) || String(b.date).localeCompare(String(a.date));
      if (sort === "date-asc") return String(a.date).localeCompare(String(b.date)) || String(a.route).localeCompare(String(b.route));
      return String(b.date).localeCompare(String(a.date)) || String(a.route).localeCompare(String(b.route));
    });
  }

  function getFilters(root) {
    const scope = root || document;
    const search = first(scope, SELECTORS.search);
    const bike = first(scope, SELECTORS.bikeFilter);
    const sort = first(scope, SELECTORS.sort);
    return {
      search: search ? search.value : "",
      bikeId: bike ? bike.value : "",
      sort: sort ? sort.value : "date-desc"
    };
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function makeRideCard(ride, bike) {
    const item = makeElement("article", "ride-card");
    item.dataset.rideId = ride.id;

    const header = makeElement("div", "ride-card__header");
    const titleWrap = makeElement("div", "ride-card__title");
    titleWrap.append(makeElement("p", "ride-card__date", formatDate(ride.date)));
    titleWrap.append(makeElement("h3", "ride-card__route", ride.route || "Untitled route"));
    const period = makeElement("span", "ride-card__period ride-card__period--" + (ride.period === "day" ? "day" : "night"), ride.period === "day" ? "Day ride" : "Night ride");
    header.append(titleWrap, period);

    const metrics = makeElement("dl", "ride-card__metrics");
    [["Distance", Number(ride.miles || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " mi"], ["Duration", formatDuration(ride.duration)], ["Bike", bike ? bike.name : "Missing bike"]].forEach(function (entry) {
      const group = makeElement("div", "ride-card__metric");
      group.append(makeElement("dt", "ride-card__label", entry[0]), makeElement("dd", "ride-card__value", entry[1]));
      metrics.append(group);
    });

    const route = makeElement("p", "ride-card__path");
    route.append(makeElement("span", "sr-only", "Route: "));
    route.append(document.createTextNode((ride.start || "Start not recorded") + " → " + (ride.end || "End not recorded")));

    const details = makeElement("div", "ride-card__details");
    if (ride.weather) details.append(makeElement("p", "ride-card__weather", ride.weather));
    if (ride.notes) details.append(makeElement("p", "ride-card__notes", ride.notes));
    if (Array.isArray(ride.photos) && ride.photos.length) {
      const gallery = makeElement("div", "ride-photo-strip");
      gallery.setAttribute("aria-label", "Ride photos");
      ride.photos.forEach(function (photo) {
        const image = document.createElement("img"); image.alt = photo.name || "Ride photo"; image.loading = "lazy"; image.dataset.photoId = photo.id;
        if (photo.url) { image.src = photo.url; image.addEventListener("error", function () { image.removeAttribute("src"); if (global.NightRideMaintenance) global.NightRideMaintenance.hydrateImages(gallery); }, { once: true }); }
        gallery.append(image);
      });
      details.append(gallery);
    }
    if (Array.isArray(ride.routePoints) && ride.routePoints.length > 1) {
      const map = makeElement("div", "route-map");
      map.dataset.routePoints = JSON.stringify(ride.routePoints);
      map.setAttribute("role", "img");
      map.setAttribute("aria-label", "Route map for " + (ride.route || "ride"));
      details.append(map);
    }

    const actions = makeElement("div", "ride-card__actions");
    const edit = makeElement("button", "button button--small button--secondary", "Edit");
    edit.type = "button";
    edit.dataset.action = "edit-ride";
    edit.dataset.rideId = ride.id;
    edit.setAttribute("aria-label", "Edit " + (ride.route || "ride"));
    const remove = makeElement("button", "button button--small button--danger", "Delete");
    remove.type = "button";
    remove.dataset.action = "delete-ride";
    remove.dataset.rideId = ride.id;
    remove.setAttribute("aria-label", "Delete " + (ride.route || "ride"));
    actions.append(edit);
    const share = makeElement("button", "button button--small", "Share");
    share.type = "button"; share.dataset.action = "share-ride"; share.dataset.rideId = ride.id;
    share.setAttribute("aria-label", "Copy a private share link for " + (ride.route || "ride"));
    actions.append(share);
    if (Array.isArray(ride.routePoints) && ride.routePoints.length > 1) {
      const exportButton = makeElement("button", "button button--small button--secondary", "Export GPX");
      exportButton.type = "button";
      exportButton.dataset.action = "export-gpx";
      exportButton.dataset.rideId = ride.id;
      exportButton.setAttribute("aria-label", "Export GPX for " + (ride.route || "ride"));
      actions.append(exportButton);
    }
    actions.append(remove);

    item.append(header, metrics, route, details, actions);
    return item;
  }

  function renderList(state, options) {
    const data = state || (global.NightRideStorage && global.NightRideStorage.getState()) || { rides: [], bikes: [] };
    const settings = options || {};
    const root = settings.root || document;
    const list = settings.list || first(root, SELECTORS.list);
    const filters = settings.filters || getFilters(root);
    const rides = filterAndSort(data.rides, filters);
    const bikes = new Map((data.bikes || []).map(function (bike) { return [bike.id, bike]; }));
    if (list) {
      list.replaceChildren();
      const fragment = document.createDocumentFragment();
      rides.forEach(function (ride) { fragment.append(makeRideCard(ride, bikes.get(ride.bikeId))); });
      list.append(fragment);
      list.hidden = rides.length === 0;
      if (global.NightRideGPX && typeof global.NightRideGPX.drawPendingMaps === "function") global.NightRideGPX.drawPendingMaps(list);
    }
    const empty = settings.empty || first(root, SELECTORS.empty);
    if (empty) empty.hidden = rides.length !== 0;
    const count = settings.count || first(root, SELECTORS.count);
    if (count) count.textContent = rides.length + (rides.length === 1 ? " ride" : " rides");
    return rides;
  }

  function populateBikeOptions(state, root) {
    const data = state || (global.NightRideStorage && global.NightRideStorage.getState()) || { bikes: [] };
    const scope = root || document;
    const controls = scope.querySelectorAll("[data-bike-options], #ride-bike, [name=\"bikeId\"], #ride-bike-filter, [data-ride-bike-filter]");
    controls.forEach(function (select) {
      if (select.tagName !== "SELECT") return;
      const selected = select.value;
      const isFilter = select.matches("#ride-bike-filter, [data-ride-bike-filter]");
      select.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = isFilter ? "all" : "";
      placeholder.textContent = isFilter ? "All bikes" : "Select a bike";
      if (!isFilter) placeholder.disabled = true;
      select.append(placeholder);
      (data.bikes || []).forEach(function (bike) {
        const option = document.createElement("option");
        option.value = bike.id;
        option.textContent = bike.name + (bike.make || bike.model ? " — " + [bike.make, bike.model].filter(Boolean).join(" ") : "");
        select.append(option);
      });
      if (Array.from(select.options).some(function (option) { return option.value === selected; })) select.value = selected;
      else select.value = isFilter ? "all" : "";
    });
    return controls;
  }

  function serializeForm(form) {
    if (!form) throw new Error("Ride form is unavailable.");
    const id = valueOf(form, ["id", "rideId"], "").trim();
    const period = valueOf(form, ["period", "timeOfDay"], "night").toLowerCase();
    const ride = {
      id: id || (global.NightRideStorage ? global.NightRideStorage.makeId("ride") : "ride-" + Date.now()),
      date: valueOf(form, ["date"], "").trim(),
      route: valueOf(form, ["route", "routeName"], "").trim(),
      start: valueOf(form, ["start"], "").trim(),
      end: valueOf(form, ["end"], "").trim(),
      miles: Number(valueOf(form, ["miles"], 0)),
      duration: Math.round(Number(valueOf(form, ["duration", "durationMinutes"], 0))),
      bikeId: valueOf(form, ["bikeId", "bike"], "").trim(),
      period: period === "day" ? "day" : "night",
      weather: valueOf(form, ["weather"], "").trim(),
      notes: valueOf(form, ["notes"], "").trim()
    };
    try { ride.routePoints = JSON.parse(valueOf(form, ["routePoints"], "[]") || "[]"); }
    catch (error) { throw new Error("Imported route geometry is invalid."); }
    try { ride.photos = JSON.parse(valueOf(form, ["photos"], "[]") || "[]"); }
    catch (error) { throw new Error("Ride photo metadata is invalid."); }
    return global.NightRideStorage ? global.NightRideStorage.normalizeRide(ride, { strict: true }) : ride;
  }

  function fillForm(form, ride) {
    if (!form || !ride) return false;
    setValue(form, ["id", "rideId"], ride.id);
    setValue(form, ["date"], ride.date);
    setValue(form, ["route", "routeName"], ride.route);
    setValue(form, ["start"], ride.start);
    setValue(form, ["end"], ride.end);
    setValue(form, ["miles"], ride.miles);
    setValue(form, ["duration", "durationMinutes"], ride.duration);
    setValue(form, ["bikeId", "bike"], ride.bikeId);
    setValue(form, ["period", "timeOfDay"], ride.period);
    setValue(form, ["weather"], ride.weather);
    setValue(form, ["notes"], ride.notes);
    setValue(form, ["routePoints"], JSON.stringify(ride.routePoints || []));
    setValue(form, ["photos"], JSON.stringify(ride.photos || []));
    form.dispatchEvent(new CustomEvent("routepointschange", { bubbles: true }));
    form.dataset.mode = "edit";
    const heading = document.querySelector("#ride-form-title, [data-ride-form-title]");
    if (heading) heading.textContent = "Edit ride";
    return true;
  }

  function resetForm(form, defaults) {
    if (!form) return false;
    form.reset();
    setValue(form, ["id", "rideId"], "");
    setValue(form, ["date"], (defaults && defaults.date) || new Date().toISOString().slice(0, 10));
    setValue(form, ["period", "timeOfDay"], (defaults && defaults.period) || "night");
    setValue(form, ["routePoints"], "[]");
    setValue(form, ["photos"], "[]");
    form.dispatchEvent(new CustomEvent("routepointschange", { bubbles: true }));
    form.dataset.mode = "add";
    const heading = document.querySelector("#ride-form-title, [data-ride-form-title]");
    if (heading) heading.textContent = "Log a ride";
    return true;
  }

  function saveForm(form) {
    if (!global.NightRideStorage) throw new Error("Storage is unavailable.");
    const ride = serializeForm(form);
    global.NightRideStorage.upsertRide(ride);
    return ride;
  }

  function findRide(id, state) {
    const data = state || (global.NightRideStorage && global.NightRideStorage.getState());
    return data && data.rides ? data.rides.find(function (ride) { return ride.id === id; }) || null : null;
  }

  function deleteRide(id) {
    if (!id) throw new Error("Ride ID is required.");
    if (!global.NightRideStorage) throw new Error("Storage is unavailable.");
    global.NightRideStorage.deleteRide(id);
    return id;
  }

  function bindFilters(callback, root) {
    const scope = root || document;
    const controls = [first(scope, SELECTORS.search), first(scope, SELECTORS.bikeFilter), first(scope, SELECTORS.sort)].filter(Boolean);
    const listener = typeof callback === "function" ? callback : function () { renderList(null, { root: scope }); };
    controls.forEach(function (control) {
      control.addEventListener(control.matches("input[type=search], input[type=text]") ? "input" : "change", listener);
    });
    return function () {
      controls.forEach(function (control) {
        control.removeEventListener(control.matches("input[type=search], input[type=text]") ? "input" : "change", listener);
      });
    };
  }

  global.NightRideRides = Object.freeze({
    SELECTORS: SELECTORS,
    escapeHTML: escapeHTML,
    formatDate: formatDate,
    formatDuration: formatDuration,
    filterAndSort: filterAndSort,
    getFilters: getFilters,
    renderList: renderList,
    populateBikeOptions: populateBikeOptions,
    serializeForm: serializeForm,
    fillForm: fillForm,
    resetForm: resetForm,
    saveForm: saveForm,
    findRide: findRide,
    deleteRide: deleteRide,
    bindFilters: bindFilters
  });
})(window);
