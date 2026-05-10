// -----------------------------------------------------
// CONFIG
// -----------------------------------------------------
const DATA_URL =
  "https://raw.githubusercontent.com/danfossnanaimo-ux/dfna-van-tracker/refs/heads/main/data/locations.json?v=5";

let map;
let markerLookup = {};
let userMarker = null;
let selectedVehicleName = null;
let lastLocations = [];

// -----------------------------------------------------
// INITIALIZE MAP
// -----------------------------------------------------
function initMap() {
  map = L.map("map").setView([49.040359, -123.866226], 18);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // Yard fence
  L.polygon(
    [
      [49.04099970424841, -123.86796072616107],
      [49.04104856987419, -123.8678059019293],
      [49.041067364333145, -123.865328714224],
      [49.04103729319556, -123.86520256114628],
      [49.04099594535228, -123.86513948460765],
      [49.04029302675602, -123.86516242153071],
      [49.04014266854696, -123.86700310961727],
      [49.04099970424841, -123.86796072616107]
    ],
    {
      color: "#ff0000",
      weight: 3,
      fillOpacity: 0.15
    }
  ).addTo(map);
}

// -----------------------------------------------------
// FETCH BACKEND JSON
// -----------------------------------------------------
async function loadLocations() {
  try {
    const response = await fetch(DATA_URL);
    const data = await response.json();
    lastLocations = data;
    updateMap(data);
    updateDropdown(data);
  } catch (err) {
    console.error("Error loading locations:", err);
  }
}

// -----------------------------------------------------
// UPDATE MAP WITH BACKEND DATA
// -----------------------------------------------------
function updateMap(locations) {
  const unique = {};

  locations.forEach(v => {
    if (!v.gps) return;
    if (!v.gps.latitude || !v.gps.longitude || !v.gps.dateTime) return;

    const key = v.name;
    const ts = new Date(v.gps.dateTime);

    if (!unique[key] || ts > new Date(unique[key].gps.dateTime)) {
      unique[key] = v;
    }
  });

  const cleanList = Object.values(unique);

  cleanList.forEach(v => {
    const lat = v.gps.latitude;
    const lon = v.gps.longitude;
    const ts = v.gps.dateTime;
    const pos = [lat, lon];

    if (!markerLookup[v.name]) {
      const marker = L.marker(pos);
      marker.bindPopup(
        `<b>${v.name}</b><br>Last update: ${ts}<br>Lat: ${lat}<br>Lon: ${lon}`
      );
      marker.addTo(map);
      markerLookup[v.name] = marker;
    } else {
      markerLookup[v.name].setLatLng(pos);
    }
  });
}

// -----------------------------------------------------
// DROPDOWN
// -----------------------------------------------------
function updateDropdown(locations) {
  const dropdown = document.getElementById("vehicleDropdown");
  dropdown.innerHTML = "";

  const showAllOpt = document.createElement("option");
  showAllOpt.value = "__show_all__";
  showAllOpt.textContent = "Show All";
  dropdown.appendChild(showAllOpt);

  const names = new Set();
  locations.forEach(v => {
    if (!v.name) return;
    if (names.has(v.name)) return;
    names.add(v.name);

    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = v.name;
    dropdown.appendChild(opt);
  });
}

document.getElementById("vehicleDropdown").addEventListener("change", e => {
  const name = e.target.value;

  if (name === "__show_all__") {
    selectedVehicleName = null;
    showAllVehicles();
    return;
  }

  selectedVehicleName = name;
  showOnlyVehicle(name);
});

// -----------------------------------------------------
// SEARCH (filters dropdown + map)
// -----------------------------------------------------
document.getElementById("vehicleSearch").addEventListener("input", e => {
  const text = e.target.value.toLowerCase().trim();
  const dropdown = document.getElementById("vehicleDropdown");

  if (text === "") {
    updateDropdown(lastLocations);
    showAllVehicles();
    return;
  }

  const filtered = lastLocations.filter(
    v => v.name && v.name.toLowerCase().includes(text)
  );

  updateDropdown(filtered);

  const allowedNames = new Set(filtered.map(v => v.name));

  Object.keys(markerLookup).forEach(name => {
    const marker = markerLookup[name];
    if (allowedNames.has(name)) {
      map.addLayer(marker);
    } else {
      map.removeLayer(marker);
    }
  });
});

// -----------------------------------------------------
// SHOW ONLY ONE VEHICLE
// -----------------------------------------------------
function showOnlyVehicle(name) {
  Object.keys(markerLookup).forEach(vName => {
    const marker = markerLookup[vName];

    if (vName === name) {
      map.addLayer(marker);
      marker.openPopup();
      zoomToVehicle(marker.getLatLng());
    } else {
      map.removeLayer(marker);
    }
  });
}

// -----------------------------------------------------
// SHOW ALL VEHICLES
// -----------------------------------------------------
function showAllVehicles() {
  Object.keys(markerLookup).forEach(vName => {
    map.addLayer(markerLookup[vName]);
  });

  map.setView([49.040359, -123.866226], 18);
}

// -----------------------------------------------------
// USER LOCATION
// -----------------------------------------------------
const userIcon = L.divIcon({
  className: "user-pulse",
  html: `<img src="https://maps.gstatic.com/mapfiles/ms2/micons/man.png" style="width:32px;height:32px;">`,
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

function updateUserLocation(lat, lon) {
  const pos = [lat, lon];

  if (userMarker) {
    userMarker.setLatLng(pos);
  } else {
    userMarker = L.marker(pos, { icon: userIcon }).addTo(map);
  }

  if (selectedVehicleName) {
    const vehicleMarker = markerLookup[selectedVehicleName];
    if (vehicleMarker) zoomToUserAndVehicle(vehicleMarker.getLatLng());
  }
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    pos => updateUserLocation(pos.coords.latitude, pos.coords.longitude),
    err => console.warn("GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

// -----------------------------------------------------
// ZOOM HELPERS
// -----------------------------------------------------
function zoomToVehicle(latlng) {
  map.setView(latlng, 18);
}

function zoomToUserAndVehicle(vehicleLatLng) {
  if (!userMarker) return zoomToVehicle(vehicleLatLng);

  const userLatLng = userMarker.getLatLng();
  const bounds = L.latLngBounds([userLatLng, vehicleLatLng]);
  map.fitBounds(bounds, { padding: [50, 50] });
}

// -----------------------------------------------------
// STARTUP
// -----------------------------------------------------
initMap();
loadLocations();
setInterval(loadLocations, 30000);
