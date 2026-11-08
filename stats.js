(function () {
  'use strict';

  const MONTHS_TO_SHOW = 6;
  const resizeObservers = new WeakMap();

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function durationMinutes(ride) {
    if (Number.isFinite(Number(ride.durationMinutes))) return Math.max(0, Number(ride.durationMinutes));
    if (Number.isFinite(Number(ride.duration))) return Math.max(0, Number(ride.duration));
    if (Number.isFinite(Number(ride.hours))) return Math.max(0, Number(ride.hours) * 60);
    return 0;
  }

  function rideDate(ride) {
    if (!ride || typeof ride.date !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ride.date);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isNightRide(ride) {
    if (typeof ride.night === 'boolean') return ride.night;
    const value = String(ride.timeOfDay || ride.period || '').toLowerCase();
    return value === 'night' || value === 'after-dark' || value === 'after dark';
  }

  function calculateSummary(rides, now) {
    const validRides = Array.isArray(rides) ? rides : [];
    const today = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const monthRides = validRides.filter(function (ride) {
      const date = rideDate(ride);
      return date && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
    });
    const sumMiles = function (list) {
      return list.reduce(function (total, ride) { return total + Math.max(0, safeNumber(ride.miles)); }, 0);
    };
    const sumMinutes = function (list) {
      return list.reduce(function (total, ride) { return total + durationMinutes(ride); }, 0);
    };
    const longestRide = validRides.reduce(function (longest, ride) {
      return Math.max(longest, Math.max(0, safeNumber(ride.miles)));
    }, 0);

    return {
      totalRides: validRides.length,
      totalMiles: sumMiles(validRides),
      totalMinutes: sumMinutes(validRides),
      totalHours: sumMinutes(validRides) / 60,
      longestRide: longestRide,
      thisMonth: {
        rides: monthRides.length,
        miles: sumMiles(monthRides),
        minutes: sumMinutes(monthRides),
        hours: sumMinutes(monthRides) / 60
      }
    };
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function monthlySeries(rides, count, endDate) {
    const size = Math.max(1, Math.floor(safeNumber(count) || MONTHS_TO_SHOW));
    const end = startOfMonth(endDate instanceof Date && !Number.isNaN(endDate.getTime()) ? endDate : new Date());
    const milesByMonth = new Map();
    (Array.isArray(rides) ? rides : []).forEach(function (ride) {
      const date = rideDate(ride);
      if (!date) return;
      const key = monthKey(date);
      milesByMonth.set(key, (milesByMonth.get(key) || 0) + Math.max(0, safeNumber(ride.miles)));
    });
    const result = [];
    for (let offset = size - 1; offset >= 0; offset -= 1) {
      const date = addMonths(end, -offset);
      result.push({
        key: monthKey(date),
        label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
        longLabel: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date),
        miles: milesByMonth.get(monthKey(date)) || 0
      });
    }
    return result;
  }

  function milesByBike(rides, bikes) {
    const bikeList = Array.isArray(bikes) ? bikes : [];
    const totals = new Map();
    bikeList.forEach(function (bike) {
      totals.set(String(bike.id), { id: String(bike.id), name: bike.name || bike.nickname || 'Unnamed bike', miles: 0, rides: 0 });
    });
    (Array.isArray(rides) ? rides : []).forEach(function (ride) {
      const key = String(ride.bikeId == null ? 'unassigned' : ride.bikeId);
      if (!totals.has(key)) totals.set(key, { id: key, name: 'Unknown bike', miles: 0, rides: 0 });
      const item = totals.get(key);
      item.miles += Math.max(0, safeNumber(ride.miles));
      item.rides += 1;
    });
    return Array.from(totals.values()).sort(function (a, b) { return b.miles - a.miles; });
  }

  function dayNightSplit(rides) {
    return (Array.isArray(rides) ? rides : []).reduce(function (split, ride) {
      const key = isNightRide(ride) ? 'night' : 'day';
      split[key].rides += 1;
      split[key].miles += Math.max(0, safeNumber(ride.miles));
      return split;
    }, { day: { rides: 0, miles: 0 }, night: { rides: 0, miles: 0 } });
  }

  function formatMiles(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(safeNumber(value));
  }

  function formatHours(value) {
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(safeNumber(value));
  }

  function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  function renderDashboard(data, now) {
    const rides = data && Array.isArray(data.rides) ? data.rides : [];
    const summary = calculateSummary(rides, now);
    setText('dashboard-total-rides', String(summary.totalRides));
    setText('dashboard-total-miles', formatMiles(summary.totalMiles));
    setText('dashboard-total-hours', formatHours(summary.totalHours));
    setText('dashboard-longest-ride', formatMiles(summary.longestRide));
    setText('dashboard-month-rides', String(summary.thisMonth.rides));
    setText('dashboard-month-miles', formatMiles(summary.thisMonth.miles));
    setText('dashboard-month-hours', formatHours(summary.thisMonth.hours));
    setText('dashboard-month-summary', summary.thisMonth.rides + ' rides · ' + formatMiles(summary.thisMonth.miles) + ' mi · ' + formatHours(summary.thisMonth.hours) + ' hr');
    return summary;
  }

  function cssColor(canvas, variable, fallback) {
    const value = getComputedStyle(canvas).getPropertyValue(variable).trim();
    return value || fallback;
  }

  function drawMonthlyChart(canvas, series) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = Math.max(280, Math.floor(canvas.clientWidth || 600));
    const height = Math.max(220, Math.floor(canvas.clientHeight || 280));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const yellow = cssColor(canvas, '--accent-yellow', '#D9A400');
    const cyan = cssColor(canvas, '--accent-cyan', '#38d9e6');
    const muted = cssColor(canvas, '--text-muted', '#8f9da8');
    const grid = cssColor(canvas, '--chart-grid', 'rgba(143, 157, 168, 0.2)');
    const padding = { top: 22, right: 16, bottom: 42, left: 48 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxMiles = Math.max.apply(null, series.map(function (item) { return item.miles; }).concat([1]));
    const roundedMax = Math.max(10, Math.ceil(maxMiles / 25) * 25);

    context.font = '12px system-ui, sans-serif';
    context.lineWidth = 1;
    context.textBaseline = 'middle';
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = padding.top + chartHeight - (chartHeight * tick / 4);
      context.strokeStyle = grid;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
      context.fillStyle = muted;
      context.textAlign = 'right';
      context.fillText(formatMiles(roundedMax * tick / 4), padding.left - 8, y);
    }

    const slot = chartWidth / Math.max(series.length, 1);
    const barWidth = Math.max(12, Math.min(52, slot * 0.58));
    series.forEach(function (item, index) {
      const barHeight = item.miles / roundedMax * chartHeight;
      const x = padding.left + slot * index + (slot - barWidth) / 2;
      const y = padding.top + chartHeight - barHeight;
      const gradient = context.createLinearGradient(0, y, 0, padding.top + chartHeight);
      gradient.addColorStop(0, yellow);
      gradient.addColorStop(1, cyan);
      context.fillStyle = gradient;
      context.fillRect(x, y, barWidth, barHeight);
      context.fillStyle = muted;
      context.textAlign = 'center';
      context.fillText(item.label, x + barWidth / 2, height - 20);
      if (item.miles > 0) {
        context.fillStyle = yellow;
        context.fillText(formatMiles(item.miles), x + barWidth / 2, Math.max(10, y - 9));
      }
    });
  }

  function renderMonthlyChart(rides, options) {
    const settings = options || {};
    const canvas = document.getElementById(settings.canvasId || 'monthly-miles-chart');
    const series = monthlySeries(rides, settings.monthCount || MONTHS_TO_SHOW, settings.endDate);
    const summary = series.map(function (item) { return item.longLabel + ': ' + formatMiles(item.miles) + ' miles'; }).join('; ');
    if (canvas) {
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Monthly ride mileage. ' + summary);
      drawMonthlyChart(canvas, series);
      if (typeof ResizeObserver === 'function' && !resizeObservers.has(canvas)) {
        let frame = 0;
        const observer = new ResizeObserver(function () {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(function () { drawMonthlyChart(canvas, series); });
        });
        observer.observe(canvas);
        resizeObservers.set(canvas, observer);
      }
    }
    setText(settings.summaryId || 'monthly-chart-summary', summary);
    return series;
  }

  function renderBikeMiles(rides, bikes, elementId) {
    const target = document.getElementById(elementId || 'bike-miles-list');
    const totals = milesByBike(rides, bikes);
    if (!target) return totals;
    target.replaceChildren();
    const max = Math.max.apply(null, totals.map(function (item) { return item.miles; }).concat([1]));
    if (!totals.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No bike mileage yet.';
      target.appendChild(empty);
      return totals;
    }
    totals.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'bike-mile-row';
      const heading = document.createElement('div');
      heading.className = 'bike-mile-heading';
      const name = document.createElement('span');
      name.textContent = item.name;
      const value = document.createElement('strong');
      value.textContent = formatMiles(item.miles) + ' mi';
      heading.append(name, value);
      const track = document.createElement('div');
      track.className = 'meter-track';
      track.setAttribute('aria-label', item.name + ', ' + formatMiles(item.miles) + ' miles over ' + item.rides + ' rides');
      const fill = document.createElement('span');
      fill.className = 'meter-fill';
      fill.style.width = (item.miles / max * 100) + '%';
      track.appendChild(fill);
      row.append(heading, track);
      target.appendChild(row);
    });
    return totals;
  }

  function renderDayNight(rides, elementId) {
    const split = dayNightSplit(rides);
    const target = document.getElementById(elementId || 'day-night-split');
    const totalMiles = split.day.miles + split.night.miles;
    if (!target) return split;
    target.replaceChildren();
    ['night', 'day'].forEach(function (key) {
      const item = split[key];
      const percent = totalMiles ? item.miles / totalMiles * 100 : 0;
      const card = document.createElement('div');
      card.className = 'split-card split-' + key;
      const label = document.createElement('span');
      label.className = 'split-label';
      label.textContent = key === 'night' ? 'Night rides' : 'Day rides';
      const value = document.createElement('strong');
      value.textContent = formatMiles(item.miles) + ' mi';
      const detail = document.createElement('span');
      detail.className = 'split-detail';
      detail.textContent = item.rides + (item.rides === 1 ? ' ride' : ' rides') + ' · ' + Math.round(percent) + '% of miles';
      card.append(label, value, detail);
      target.appendChild(card);
    });
    return split;
  }

  function renderStats(data, options) {
    const state = data || {};
    const rides = Array.isArray(state.rides) ? state.rides : [];
    const bikes = Array.isArray(state.bikes) ? state.bikes : [];
    return {
      monthly: renderMonthlyChart(rides, options),
      bikes: renderBikeMiles(rides, bikes),
      dayNight: renderDayNight(rides)
    };
  }

  window.NightRideStats = Object.freeze({
    calculateSummary: calculateSummary,
    monthlySeries: monthlySeries,
    milesByBike: milesByBike,
    dayNightSplit: dayNightSplit,
    renderDashboard: renderDashboard,
    renderMonthlyChart: renderMonthlyChart,
    renderBikeMiles: renderBikeMiles,
    renderDayNight: renderDayNight,
    renderStats: renderStats
  });
}());
