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
  map = L.map("map", { zoomAnimation: true }).setView([49.040359, -123.866226], 18);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // YARD FENCE
  L.polygon(
    [
      [49.0410015, -123.8680866],
      [49.0410489, -123.8680984],
      [49.0410934, -123.8680656],
      [49.0411231, -123.8680275],
      [49.041138,  -123.8679841],
      [49.0411436, -123.867922],
      [49.0411349, -123.8657126],
      [49.0411261, -123.8653535],
      [49.0411201, -123.865225],
      [49.0411126, -123.865155],
      [49.0410993, -123.8650879],
      [49.0410815, -123.865035],
      [49.041073,  -123.8650161],
      [49.0410667, -123.8650087],
      [49.0410459, -123.8649914],
      [49.0410104, -123.8649743],
      [49.0409566, -123.8649617],
      [49.0407962, -123.8649522],
      [49.0406169, -123.8649401],
      [49.040469,  -123.8649408],
      [49.0403253, -123.8649361],
      [49.0401176, -123.8670691],
      [49.0410045, -123.8680868],
      [49.0410015, -123.8680866]
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
    const pos = [lat, lon];

    // Extract numeric portion
    const vanNumber = v.name.match(/\d+(?!.*\d)/)?.[0] || "";

    // Custom marker with number overlay
    const icon = L.divIcon({
      className: "van-icon",
      html: `
        <div class="van-pin"></div>
        <div class="van-number" id="num-${v.name}">${vanNumber}</div>
      `,
      iconSize: [64, 64],
      iconAnchor: [32, 64]
    });

    if (!markerLookup[v.name]) {
      const marker = L.marker(pos, { icon, opacity: 1 });
      marker.addTo(map);
      markerLookup[v.name] = marker;
    } else {
      markerLookup[v.name].setLatLng(pos);
    }
  });
}

// -----------------------------------------------------
// SORTED DROPDOWN
// -----------------------------------------------------
function updateDropdown(locations) {
  const dropdown = document.getElementById("vehicleDropdown");
  dropdown.innerHTML = "";

  const showAllOpt = document.createElement("option");
  showAllOpt.value = "__show_all__";
  showAllOpt.textContent = "Show All";
  dropdown.appendChild(showAllOpt);

  const uniqueNames = [...new Set(locations.map(v => v.name))];

  uniqueNames.sort((a, b) => {
    const numA = parseInt(a.match(/\d+(?!.*\d)/)?.[0] || "0");
    const numB = parseInt(b.match(/\d+(?!.*\d)/)?.[0] || "0");
    return numA - numB;
  });

  uniqueNames.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    dropdown.appendChild(opt);
  });
}

// -----------------------------------------------------
// DROPDOWN FILTERING + 10m PROXIMITY LOGIC
// -----------------------------------------------------
document.getElementById("vehicleDropdown").addEventListener("change", e => {
  const dropdown = document.getElementById("vehicleDropdown");
  const resetButton = document.getElementById("resetButton");

  const name = e.target.value;

  if (name === "__show_all__") {
    selectedVehicleName = null;
    showAllVehicles();
    return;
  }

  // Hide dropdown, show reset button
  dropdown.style.display = "none";
  resetButton.style.display = "block";

  selectedVehicleName = name;

  const selectedMarker = markerLookup[name];
  const selectedPos = selectedMarker.getLatLng();

  Object.keys(markerLookup).forEach(vName => {
    const marker = markerLookup[vName];
    const pos = marker.getLatLng();
    const numEl = document.getElementById(`num-${vName}`);

    if (vName === name) {
      marker.setOpacity(1);
      numEl.classList.add("selected");
      zoomToUserAndVehicle(pos);

    } else {
      const dist = selectedPos.distanceTo(pos);

      if (dist <= 10) {
        marker.setOpacity(0.3);
        numEl.classList.remove("selected");
      } else {
        map.removeLayer(marker);
      }
    }
  });
});

// -----------------------------------------------------
// RESET BUTTON
// -----------------------------------------------------
document.getElementById("resetButton").addEventListener("click", () => {
  const dropdown = document.getElementById("vehicleDropdown");
  const resetButton = document.getElementById("resetButton");

  dropdown.style.display = "block";
  resetButton.style.display = "none";

  selectedVehicleName = null;
  showAllVehicles();
});

// -----------------------------------------------------
// SHOW ALL VEHICLES
// -----------------------------------------------------
function showAllVehicles() {
  Object.keys(markerLookup).forEach(vName => {
    const marker = markerLookup[vName];
    const numEl = document.getElementById(`num-${vName}`);

    marker.setOpacity(1);
    numEl.classList.remove("selected");

    map.addLayer(marker);
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
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    pos => updateUserLocation(pos.coords.latitude, pos.coords.longitude),
    err => console.warn("GPS error:", err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

// -----------------------------------------------------
// FIXED ZOOM LOGIC
// -----------------------------------------------------
function zoomToUserAndVehicle(vehicleLatLng) {
  if (!userMarker) {
    map.flyTo(vehicleLatLng, 18);
    return;
  }

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
