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
let userToVanLine = null;

// -----------------------------------------------------
// INITIALIZE MAP
// -----------------------------------------------------
function initMap() {
  map = L.map("map", { zoomAnimation: true }).setView([49.040359, -123.866226], 18);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // Yard fence
  L.polygon(
    [
      [
            -123.8680866,
            49.0410015
          ],
          [
            -123.8680984,
            49.0410489
          ],
          [
            -123.8680656,
            49.0410934
          ],
          [
            -123.8680275,
            49.0411231
          ],
          [
            -123.8679841,
            49.041138
          ],
          [
            -123.867922,
            49.0411436
          ],
          [
            -123.8657126,
            49.0411349
          ],
          [
            -123.8653499,
            49.0411174
          ],
          [
            -123.8651181,
            49.0410783
          ],
          [
            -123.8650267,
            49.0410241
          ],
          [
            -123.8649999,
            49.0409744
          ],
          [
            -123.865034,
            49.0403033
          ],
          [
            -123.8670691,
            49.0401176
          ],
          [
            -123.8680868,
            49.0410045
          ]
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

  updateUserToVanLine();
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

// -----------------------------------------------------
// DROPDOWN FILTERING
// -----------------------------------------------------
document.getElementById("vehicleDropdown").addEventListener("change", e => {
  const name = e.target.value;

  if (name === "__show_all__") {
    selectedVehicleName = null;
    showAllVehicles();
    clearUserToVanLine();
    return;
  }

  selectedVehicleName = name;

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

  updateUserToVanLine();
});

// -----------------------------------------------------
// SEARCH FILTERING
// -----------------------------------------------------
document.getElementById("vehicleSearch").addEventListener("input", e => {
  const text = e.target.value.toLowerCase().trim();

  if (text === "") {
    updateDropdown(lastLocations);
    showAllVehicles();
    clearUserToVanLine();
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

  // Auto-zoom when exactly one match
  if (filtered.length === 1) {
    const vanName = filtered[0].name;
    const vanMarker = markerLookup[vanName];

    if (vanMarker) {
      if (userMarker) {
        zoomToUserAndVehicle(vanMarker.getLatLng());
      } else {
        zoomToVehicle(vanMarker.getLatLng());
      }
    }
  }

  updateUserToVanLine();
});

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

  updateUserToVanLine();
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    pos => updateUserLocation(pos.coords.latitude, pos.coords.longitude),
    err => console.warn("GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

// -----------------------------------------------------
// DISTANCE + LINE
// -----------------------------------------------------
function updateUserToVanLine() {
  if (!selectedVehicleName || !userMarker) {
    clearUserToVanLine();
    return;
  }

  const vanMarker = markerLookup[selectedVehicleName];
  if (!vanMarker) return;

  const userPos = userMarker.getLatLng();
  const vanPos = vanMarker.getLatLng();

  // Draw line
  if (userToVanLine) {
    userToVanLine.setLatLngs([userPos, vanPos]);
  } else {
    userToVanLine = L.polyline([userPos, vanPos], {
      color: "blue",
      weight: 4,
      opacity: 0.7
    }).addTo(map);
  }

  // Distance readout
  const distMeters = userPos.distanceTo(vanPos);
  const distKm = (distMeters / 1000).toFixed(2);

  const box = document.getElementById("distanceBox");
  box.style.display = "block";
  box.textContent = `You are ${distKm} km away`;

  // Smooth zoom to include both
  const bounds = L.latLngBounds([userPos, vanPos]);
  map.flyToBounds(bounds, { padding: [80, 80] });
}

function clearUserToVanLine() {
  if (userToVanLine) {
    map.removeLayer(userToVanLine);
    userToVanLine = null;
  }
  document.getElementById("distanceBox").style.display = "none";
}

// -----------------------------------------------------
// ZOOM HELPERS
// -----------------------------------------------------
function zoomToVehicle(latlng) {
  map.flyTo(latlng, 18);
}

function zoomToUserAndVehicle(vehicleLatLng) {
  if (!userMarker) return zoomToVehicle(vehicleLatLng);

  const userLatLng = userMarker.getLatLng();
  const bounds = L.latLngBounds([userLatLng, vehicleLatLng]);
  map.flyToBounds(bounds, { padding: [80, 80] });
}

// -----------------------------------------------------
// STARTUP
// -----------------------------------------------------
initMap();
loadLocations();
setInterval(loadLocations, 30000);
