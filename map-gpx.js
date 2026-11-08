(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const MAX_POINTS = 25000;

  function validPoint(point) {
    if (!point || typeof point !== "object") return false;
    const lat = Number(point && point.lat);
    const lon = Number(point && (point.lon != null ? point.lon : point.lng));
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  function normalizePoints(points) {
    return (Array.isArray(points) ? points : []).filter(validPoint).slice(0, MAX_POINTS).map(function (point) {
      const result = { lat: Number(point.lat), lon: Number(point.lon != null ? point.lon : point.lng) };
      if (Number.isFinite(Number(point.elevation))) result.elevation = Number(point.elevation);
      if (point.time) result.time = String(point.time);
      return result;
    });
  }

  function parseGPX(text) {
    const documentNode = new DOMParser().parseFromString(String(text || ""), "application/xml");
    if (documentNode.querySelector("parsererror")) throw new Error("The GPX file is not valid XML.");
    let nodes = Array.from(documentNode.getElementsByTagName("trkpt"));
    if (!nodes.length) nodes = Array.from(documentNode.getElementsByTagName("rtept"));
    const points = nodes.map(function (node) {
      const point = { lat: Number(node.getAttribute("lat")), lon: Number(node.getAttribute("lon")) };
      const elevation = node.getElementsByTagName("ele")[0];
      const time = node.getElementsByTagName("time")[0];
      if (elevation && Number.isFinite(Number(elevation.textContent))) point.elevation = Number(elevation.textContent);
      if (time && time.textContent) point.time = time.textContent.trim();
      return point;
    });
    const valid = normalizePoints(points);
    if (valid.length < 2) throw new Error("The GPX file needs at least two track points.");
    return valid;
  }

  function xml(value) {
    return String(value == null ? "" : value).replace(/[&<>\"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" }[character];
    });
  }

  function toGPX(ride) {
    const points = normalizePoints(ride && ride.routePoints);
    if (points.length < 2) throw new Error("This ride does not have a route track.");
    const track = points.map(function (point) {
      return "      <trkpt lat=\"" + point.lat + "\" lon=\"" + point.lon + "\">" +
        (Number.isFinite(point.elevation) ? "<ele>" + point.elevation + "</ele>" : "") +
        (point.time ? "<time>" + xml(point.time) + "</time>" : "") + "</trkpt>";
    }).join("\n");
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<gpx version=\"1.1\" creator=\"Night Ride Log\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n  <metadata><name>" + xml(ride.route || "Night ride") + "</name></metadata>\n  <trk><name>" + xml(ride.route || "Night ride") + "</name><trkseg>\n" + track + "\n  </trkseg></trk>\n</gpx>\n";
  }

  function drawMap(container, input) {
    if (!container) return;
    const points = normalizePoints(input);
    container.replaceChildren();
    if (points.length < 2) { container.hidden = true; return; }
    container.hidden = false;
    const width = 600, height = 190, padding = 22;
    const lats = points.map(function (point) { return point.lat; });
    const lons = points.map(function (point) { return point.lon; });
    const minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    const minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons);
    const latSpan = maxLat - minLat || .001, lonSpan = maxLon - minLon || .001;
    const project = function (point) {
      return [padding + ((point.lon - minLon) / lonSpan) * (width - padding * 2), height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2)];
    };
    const displayStep = Math.max(1, Math.ceil(points.length / 2000));
    const displayPoints = points.filter(function (_, index) { return index % displayStep === 0; });
    if (displayPoints[displayPoints.length - 1] !== points[points.length - 1]) displayPoints.push(points[points.length - 1]);
    const coords = displayPoints.map(project);
    const pathData = coords.map(function (point, index) { return (index ? "L" : "M") + point[0].toFixed(2) + " " + point[1].toFixed(2); }).join(" ");
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("aria-hidden", "true");
    ["route-map__halo", "route-map__line"].forEach(function (className) {
      const path = document.createElementNS(NS, "path"); path.setAttribute("d", pathData); path.setAttribute("class", className); svg.append(path);
    });
    [coords[0], coords[coords.length - 1]].forEach(function (point) {
      const circle = document.createElementNS(NS, "circle"); circle.setAttribute("cx", point[0]); circle.setAttribute("cy", point[1]); circle.setAttribute("r", "5"); circle.setAttribute("class", "route-map__point"); svg.append(circle);
    });
    container.append(svg);
  }

  function drawPendingMaps(root) {
    (root || document).querySelectorAll(".route-map[data-route-points]").forEach(function (map) {
      if (map.dataset.rendered === map.dataset.routePoints) return;
      try { drawMap(map, JSON.parse(map.dataset.routePoints)); map.dataset.rendered = map.dataset.routePoints; } catch (error) { map.hidden = true; }
    });
  }

  function safeName(value) {
    return String(value || "ride").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ride";
  }

  function downloadRide(ride) {
    const url = URL.createObjectURL(new Blob([toGPX(ride)], { type: "application/gpx+xml" }));
    const link = document.createElement("a"); link.href = url; link.download = safeName(ride.route) + ".gpx";
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function init() {
    const input = document.getElementById("ride-gpx-input");
    const hidden = document.getElementById("ride-route-points");
    const preview = document.getElementById("ride-route-preview");
    const status = document.getElementById("ride-gpx-status");
    if (input && hidden) input.addEventListener("change", async function () {
      const file = input.files && input.files[0]; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("GPX files must be 5 MB or smaller.");
        const points = parseGPX(await file.text()); hidden.value = JSON.stringify(points); drawMap(preview, points);
        if (status) status.textContent = points.length + " route points imported from " + file.name + ".";
      } catch (error) { if (status) status.textContent = error.message; hidden.value = "[]"; drawMap(preview, []); }
      input.value = "";
    });
    const form = document.getElementById("ride-form");
    if (form) form.addEventListener("routepointschange", function () {
      let points = []; try { points = JSON.parse(hidden.value || "[]"); } catch (error) { points = []; }
      drawMap(preview, points); if (status) status.textContent = points.length > 1 ? points.length + " stored route points." : "Optional. Route data stays with this ride.";
    });
    document.addEventListener("click", function (event) {
      const button = event.target.closest('[data-action="export-gpx"]'); if (!button) return;
      const state = global.NightRideStorage && global.NightRideStorage.getState();
      const ride = state && state.rides.find(function (item) { return item.id === button.dataset.rideId; });
      if (ride) downloadRide(ride);
    });
    drawPendingMaps();
    new MutationObserver(function () { drawPendingMaps(); }).observe(document.getElementById("rides-list") || document.body, { childList: true, subtree: true });
  }

  global.NightRideGPX = Object.freeze({ parseGPX: parseGPX, toGPX: toGPX, drawMap: drawMap, normalizePoints: normalizePoints });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(window);
