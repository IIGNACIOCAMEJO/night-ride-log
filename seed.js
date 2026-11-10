(function (global) {
  "use strict";

  const SCHEMA_VERSION = 1;

  const bikes = [
    {
      id: "bike-nightshade",
      name: "Nightshade",
      year: 2022,
      make: "Yamaha",
      model: "MT-09",
      color: "Midnight Black",
      odometer: 18420
    },
    {
      id: "bike-ghost",
      name: "Ghost Runner",
      year: 2020,
      make: "Honda",
      model: "Rebel 500",
      color: "Graphite",
      odometer: 12680
    }
  ];

  const rides = [
    {
      id: "ride-2026-10-29-river",
      date: "2026-10-29",
      route: "Neon River Loop",
      start: "Downtown Garage",
      end: "Downtown Garage",
      miles: 47.8,
      duration: 76,
      bikeId: "bike-nightshade",
      period: "night",
      weather: "Clear, 54°F",
      notes: "Quiet roads after midnight; stopped beneath the east bridge lights.",
      routePoints: [
        { lat: 39.7391, lon: -104.9903 }, { lat: 39.7427, lon: -104.9774 },
        { lat: 39.7518, lon: -104.9671 }, { lat: 39.7624, lon: -104.9748 },
        { lat: 39.7688, lon: -104.9907 }, { lat: 39.7594, lon: -105.0041 },
        { lat: 39.7462, lon: -105.0068 }, { lat: 39.7391, lon: -104.9903 }
      ]
    },
    {
      id: "ride-2026-10-18-ridge",
      date: "2026-10-18",
      route: "Blackglass Ridge",
      start: "North Fuel Stop",
      end: "Ridge Overlook",
      miles: 82.4,
      duration: 128,
      bikeId: "bike-nightshade",
      period: "day",
      weather: "Partly cloudy, 61°F",
      notes: "Dry pavement and a strong crosswind on the upper switchbacks.",
      routePoints: [
        { lat: 39.7733, lon: -105.0438 }, { lat: 39.7857, lon: -105.0692 },
        { lat: 39.7984, lon: -105.0911 }, { lat: 39.8119, lon: -105.1063 },
        { lat: 39.8248, lon: -105.1012 }, { lat: 39.8351, lon: -105.0834 },
        { lat: 39.8427, lon: -105.0586 }
      ]
    },
    {
      id: "ride-2026-10-06-industrial",
      date: "2026-10-06",
      route: "Industrial Halo",
      start: "West Market",
      end: "Canal District",
      miles: 31.2,
      duration: 58,
      bikeId: "bike-ghost",
      period: "night",
      weather: "Light mist, 49°F",
      notes: "Refinery glow reflected off wet streets; visor stayed clear.",
      routePoints: [
        { lat: 39.7694, lon: -104.9985 }, { lat: 39.7781, lon: -104.9842 },
        { lat: 39.7836, lon: -104.9628 }, { lat: 39.7762, lon: -104.9461 },
        { lat: 39.7628, lon: -104.9497 }, { lat: 39.7543, lon: -104.9695 }
      ]
    },
    {
      id: "ride-2026-09-24-canyon",
      date: "2026-09-24",
      route: "Signal Canyon Run",
      start: "South Gate",
      end: "Signal Peak",
      miles: 109.6,
      duration: 172,
      bikeId: "bike-nightshade",
      period: "day",
      weather: "Sunny, 68°F",
      notes: "Longest run of the month. Clear sightlines all the way to the peak."
    },
    {
      id: "ride-2026-09-12-airport",
      date: "2026-09-12",
      route: "Airport Perimeter",
      start: "Old Terminal",
      end: "Old Terminal",
      miles: 42.5,
      duration: 67,
      bikeId: "bike-ghost",
      period: "night",
      weather: "Clear, 57°F",
      notes: "Watched the late arrivals from the service-road turnout."
    },
    {
      id: "ride-2026-09-03-lakeshore",
      date: "2026-09-03",
      route: "Lakeshore Static",
      start: "East Marina",
      end: "Pine Dam",
      miles: 65.1,
      duration: 104,
      bikeId: "bike-nightshade",
      period: "night",
      weather: "Cool and clear, 55°F",
      notes: "Low traffic, scattered fog near the dam."
    },
    {
      id: "ride-2026-08-21-desert",
      date: "2026-08-21",
      route: "Desert Relay",
      start: "Mile Zero Diner",
      end: "Solar Array",
      miles: 96.3,
      duration: 145,
      bikeId: "bike-ghost",
      period: "day",
      weather: "Hot and dry, 86°F",
      notes: "Early start beat most of the heat. One fuel stop on the return leg."
    },
    {
      id: "ride-2026-08-09-beltway",
      date: "2026-08-09",
      route: "Midnight Beltway",
      start: "Central Station",
      end: "Central Station",
      miles: 53.7,
      duration: 81,
      bikeId: "bike-nightshade",
      period: "night",
      weather: "Clear, 64°F",
      notes: "First full loop after the chain adjustment; everything felt dialed in."
    },
    {
      id: "ride-2026-07-27-harbor",
      date: "2026-07-27",
      route: "Harbor Afterglow",
      start: "Pier 4",
      end: "Beacon Point",
      miles: 38.9,
      duration: 63,
      bikeId: "bike-ghost",
      period: "night",
      weather: "Breezy, 62°F",
      notes: "Cargo cranes lit cyan over the water."
    }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createSeedState() {
    return clone({ version: SCHEMA_VERSION, bikes: bikes, rides: rides });
  }

  global.NightRideSeed = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    createSeedState: createSeedState
  });
})(window);
