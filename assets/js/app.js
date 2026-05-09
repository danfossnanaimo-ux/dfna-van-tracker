// -----------------------------------------------------
// CONFIG
// -----------------------------------------------------
const DATA_URL =
  "https://drive.google.com/uc?export=download&id=1NsnzDRARFZylR22FVpN6P9s6GxuNlina";

let map;
let markerLookup = {};
let labelLookup = {};
let userMarker = null;
let selectedVehicleName = null;

// -----------------------------------------------------
// INITIALIZE MAP
// -----------------------------------------------------
function initMap() {
  map = L.map("map").setView([49.040359, -123.866226], 18);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // Yard boundary
  L.polygon(
    [
      [49.0410017, -123.8680194],
      [49.0410226, -123.8680323],
      [49.0410378, -123.868029],
      [49.0410517, -123.8680267],
      [49.0410698, -123.8680157],
      [49.0410917, -123.8680034],
      [49.0411048, -123.8679701],
      [49.0411114, -123.867929],
      [49.0411135, -123.8678859],
      [49.0411087, -123.8652783],
      [49.041106, -123.8651884],
      [49.0410897, -123.8650957],
      [49.0410587, -123.8650422],
      [49.0409912, -123.8650092],
      [49.040289, -123.8650175],
      [49.0401243, -123.8670526],
      [49.0410017, -123.8680194]
    ],
    {
      color: "#ff0000",
      weight: 3,
      fillOpacity: 0.15
    }
  ).addTo(map);
}

// -----------------------------------------------------
// FETCH GOOGLE DRIVE DATA
// -----------------------------------------------------
async function loadLocations() {
  try {
    const response = await fetch(DATA_URL);
    const data = await response.json();
    updateMap(data);
    updateDropdown(data);
  } catch (err) {
    console.error("Error loading locations:", err);
  }
}

// -----------------------------------------------------
// UPDATE MAP WITH NEW DATA
// -----------------------------------------------------
function updateMap(locations) {
  // Deduplicate by newest timestamp
  const unique = {};
  locations.forEach(v => {
    if (!unique[v.name] || new Date(v.timestamp) > new Date(unique[v.name].timestamp)) {
      unique[v.name] = v;
    }
  });

  const cleanList = Object.values(unique);

  // Update or create markers
  cleanList.forEach(v => {
    if (!v.lat || !v.lon) return;

    const pos = [v.lat, v.lon];

    // Main marker
    if (!markerLookup[v.name]) {
      const marker = L.marker(pos);
      marker.bindPopup(
        `<b>${v.name}</b><br>Last update: ${v.timestamp}<br>Lat: ${v.lat}<br>Lon: ${v.lon}`
      );
      marker.addTo(map);
      markerLookup[v.name] = marker;
    } else {
      markerLookup[v.name].setLatLng(pos);
    }

    // Label
    if (!labelLookup[v.name]) {
      const label = L.marker(pos, {
        icon: L.divIcon({
          className: "vehicle-label",
          html: v.name,
          iconSize: [60, 20],
          iconAnchor: [30, -10]
        })
      });
      label.addTo(map);
      labelLookup[v.name] = label;
    } else {
      labelLookup[v.name].setLatLng(pos);
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

  locations.forEach(v => {
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
// SEARCH
// -----------------------------------------------------
document.getElementById("vehicleSearch").addEventListener("input", e => {
  const text = e.target.value.toLowerCase();
  const dropdown = document.getElementById("vehicleDropdown");

  if (text.trim() === "") {
    loadLocations();
    return;
  }

  dropdown.innerHTML = "";

  Object.keys(markerLookup)
    .filter(name => name.toLowerCase().includes(text))
    .forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      dropdown.appendChild(opt);
    });
});

// -----------------------------------------------------
// SHOW ONLY ONE VEHICLE
// -----------------------------------------------------
function showOnlyVehicle(name) {
  Object.keys(markerLookup).forEach(vName => {
    const marker = markerLookup[vName];
    const label = labelLookup[vName];

    if (vName === name) {
      map.addLayer(marker);
      map.addLayer(label);
      marker.openPopup();
      zoomToVehicle(marker.getLatLng());
    } else {
      map.removeLayer(marker);
      map.removeLayer(label);
    }
  });
}

// -----------------------------------------------------
// SHOW ALL VEHICLES
// -----------------------------------------------------
function showAllVehicles() {
  Object.keys(markerLookup).forEach(vName => {
    map.addLayer(markerLookup[vName]);
    map.addLayer(labelLookup[vName]);
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
  if (!
