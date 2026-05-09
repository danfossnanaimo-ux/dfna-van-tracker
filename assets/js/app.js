// Google Drive direct-download URL
const DATA_URL = "https://drive.google.com/uc?export=download&id=1NsnzDRARFZylR22FVpN6P9s6GxuNlina";

// Initialize map (Leaflet example)
let map = L.map('map').setView([49.1659, -123.9401], 11); // Nanaimo default

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let markers = [];

// Fetch + update map
async function loadLocations() {
  try {
    document.getElementById("loading").style.display = "block";

    const response = await fetch(DATA_URL);
    const data = await response.json();

    updateMap(data);

  } catch (err) {
    console.error("Error loading locations:", err);
  } finally {
    document.getElementById("loading").style.display = "none";
  }
}

// Update map markers
function updateMap(locations) {
  // Clear old markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  locations.forEach(van => {
    let marker = L.marker([van.lat, van.lng]).addTo(map);
    marker.bindPopup(`<b>${van.name}</b><br>${van.timestamp}`);
    markers.push(marker);
  });
}

// Initial load
loadLocations();

// Auto-refresh every 30 seconds
setInterval(loadLocations, 30000);
