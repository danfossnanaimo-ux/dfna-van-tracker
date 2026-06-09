let map;
let markerLookup = {};
let selectedVehicleName = null;
let trackingSelectedVehicle = false;
let userMarker = null;
let userAccuracyCircle = null;
let lastKnownUserPos = null;

// Initialize the application once the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    initLocationTracking();
    fetchData();
    // Poll for fresh coordinates every 30 seconds
    setInterval(fetchData, 30000);
});

// -----------------------------------------------------
// MAP INITIALIZATION
// -----------------------------------------------------
function initMap() {
    // Center initially on Nanaimo area, zoomed out
    map = L.map('map', {
        zoomControl: false
    }).setView([49.1659, -123.9401], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

// -----------------------------------------------------
// USER LOCATION TRACKING (GPS)
// -----------------------------------------------------
function initLocationTracking() {
    if (!navigator.geolocation) {
        console.warn("Geolocation not supported by this browser.");
        return;
    }

    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            lastKnownUserPos = L.latLng(lat, lng);

            // Custom Blue Pulse Marker for User
            const blueDotIcon = L.divIcon({
                className: 'user-location-marker',
                html: '<div class="pulse-dot"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            if (!userMarker) {
                userMarker = L.marker(lastKnownUserPos, { icon: blueDotIcon }).addTo(map);
                userAccuracyCircle = L.circle(lastKnownUserPos, {
                    radius: accuracy,
                    color: '#1e88e5',
                    fillColor: '#1e88e5',
                    fillOpacity: 0.15,
                    weight: 1
                }).addTo(map);
            } else {
                userMarker.setLatLng(lastKnownUserPos);
                userAccuracyCircle.setLatLng(lastKnownUserPos);
                userAccuracyCircle.setRadius(accuracy);
            }

            // Continuous camera tracking loop if a specific van is isolated
            if (trackingSelectedVehicle && selectedVehicleName) {
                const vehicleMarker = markerLookup[selectedVehicleName];
                if (vehicleMarker) {
                    zoomToUserAndVehicle(vehicleMarker.getLatLng());
                }
            }
        },
        (error) => {
            console.warn("Error tracking user location:", error.message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 27000
        }
    );
}

// -----------------------------------------------------
// DATA FETCHING & MARKER UPDATE
// -----------------------------------------------------
function fetchData() {
    fetch('data/locations.json', { cache: 'no-store' })
        .then(response => {
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return response.json();
        })
        .then(data => {
            updateMarkers(data);
            populateDropdown(data);
        })
        .catch(err => console.error("Error loading vehicle data:", err));
}

function updateMarkers(vehicles) {
    const currentNames = vehicles.map(v => v.name);

    // Remove any markers from the map that are no longer in the feed
    Object.keys(markerLookup).forEach(name => {
        if (!currentNames.includes(name)) {
            map.removeLayer(markerLookup[name]);
            delete markerLookup[name];
        }
    });

    vehicles.forEach(vehicle => {
        const lat = parseFloat(vehicle.latitude);
        const lng = parseFloat(vehicle.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const pos = [lat, lng];
        const vanNumber = vehicle.name.match(/\d+(?!.*\d)/)?.[0] || "";

        // If filtering is enabled, regulate opacities/visibilities natively
        let opacity = 1;
        let isVisible = true;

        if (selectedVehicleName) {
            if (vehicle.name === selectedVehicleName) {
                opacity = 1;
            } else {
                const selMarker = markerLookup[selectedVehicleName];
                if (selMarker) {
                    const dist = selMarker.getLatLng().distanceTo(L.latLng(pos));
                    if (dist <= 10) {
                        opacity = 0.3; // ghost adjacent vehicles within 10 meters
                    } else {
                        isVisible = false; // eliminate external noise completely
                    }
                }
            }
        }

        if (!markerLookup[vehicle.name]) {
            // New Vehicle Marker Entry
            const marker = L.marker(pos, {
                icon: buildIcon(vehicle.name, vanNumber),
                opacity: opacity
            });
            
            if (isVisible) marker.addTo(map);

            marker.bindPopup(`
                <div style="font-family:system-ui, sans-serif; font-size:13px;">
                    <strong style="font-size:14px; color:#1e88e5;">${vehicle.name}</strong><br/>
                    <span style="color:#666;">Driver:</span> ${vehicle.driver || 'Unassigned'}<br/>
                    <span style="color:#666;">Last Updated:</span> ${vehicle.time || 'Just now'}
                </div>
            `);
            
            markerLookup[vehicle.name] = marker;
        } else {
            // Existing Vehicle Update Route
            const marker = markerLookup[vehicle.name];
            marker.setLatLng(pos);
            marker.setOpacity(opacity);
            marker.setIcon(buildIcon(vehicle.name, vanNumber));

            if (isVisible && !map.hasLayer(marker)) {
                marker.addTo(map);
            } else if (!isVisible && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }
    });

    // Auto-adjust zoom bounding box if active selection context exists
    if (trackingSelectedVehicle && selectedVehicleName && markerLookup[selectedVehicleName]) {
        zoomToUserAndVehicle(markerLookup[selectedVehicleName].getLatLng());
    } else if (!selectedVehicleName && Object.keys(markerLookup).length > 0 && !lastKnownUserPos) {
        // Fallback default frame bound for initial payload load
        const group = L.featureGroup(Object.values(markerLookup));
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Custom DivIcon UI Pipeline to render explicit Van numbering badges above assets
function buildIcon(name, vanNumber) {
    const isSelected = (name === selectedVehicleName);
    return L.divIcon({
        className: 'custom-van-marker',
        html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <div style="
                    background: ${isSelected ? '#e53936' : '#1e88e5'};
                    color: white;
                    font-weight: bold;
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    border: 1.5px solid white;
                    white-space: nowrap;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    transform: translateY(-4px);
                    z-index: 2;
                ">${vanNumber ? 'Van ' + vanNumber : 'Asset'}</div>
                <div style="
                    width: 12px;
                    height: 12px;
                    background: ${isSelected ? '#e53936' : '#1e88e5'};
                    border: 2px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
                    z-index: 1;
                "></div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 36]
    });
}

// -----------------------------------------------------
// DROPDOWN FILTERING + 10m PROXIMITY LOGIC
// -----------------------------------------------------
function populateDropdown(vehicles) {
    const dropdown = document.getElementById("vehicleDropdown");
    if (!dropdown) return;

    // Preserve selection context
    const currentSelection = dropdown.value;

    // Clear previous option lists cleanly
    dropdown.innerHTML = '<option value="__show_all__">📱 Show All Vehicles</option>';

    vehicles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach(vehicle => {
        const opt = document.createElement("option");
        opt.value = vehicle.name;
        opt.textContent = `${vehicle.name} (${vehicle.driver || 'No Driver'})`;
        dropdown.appendChild(opt);
    });

    if (currentSelection && vehicles.some(v => v.name === currentSelection)) {
        dropdown.value = currentSelection;
    } else if (selectedVehicleName) {
        dropdown.value = selectedVehicleName;
    }
}

// Dynamic elements binding securely behind target elements hooks verification
const vehicleDropdown = document.getElementById("vehicleDropdown");
if (vehicleDropdown) {
    vehicleDropdown.addEventListener("change", e => {
        const dropdown = document.getElementById("vehicleDropdown");
        const resetButton = document.getElementById("resetButton");
        const navButton = document.getElementById("navButton");
        const name = e.target.value;

        if (name === "__show_all__") {
            selectedVehicleName = null;
            trackingSelectedVehicle = false;
            if (navButton) navButton.style.display = "none";
            if (resetButton) resetButton.style.display = "none";
            fetchData(); // Reset layout bounds completely
            return;
        }

        if (resetButton) resetButton.style.display = "block";
        if (navButton) navButton.style.display = "block";
        selectedVehicleName = name;
        trackingSelectedVehicle = true;

        fetchData(); // Trigger instant view map transformation
    });
}

const resetButton = document.getElementById("resetButton");
if (resetButton) {
    resetButton.addEventListener("click", () => {
        selectedVehicleName = null;
        trackingSelectedVehicle = false;
        
        const dropdown = document.getElementById("vehicleDropdown");
        const resetButtonEl = document.getElementById("resetButton");
        const navButton = document.getElementById("navButton");

        if (dropdown) dropdown.value = "__show_all__";
        if (resetButtonEl) resetButtonEl.style.display = "none";
        if (navButton) navButton.style.display = "none";

        fetchData();
    });
}

const navButton = document.getElementById("navButton");
if (navButton) {
    navButton.addEventListener("click", () => {
        if (!selectedVehicleName || !markerLookup[selectedVehicleName]) return;
        const targetLatLng = markerLookup[selectedVehicleName].getLatLng();
        
        // Native Apple Maps or Google Maps deep routing injection
        const mapsUrl = `https://maps.google.com/?daddr=${targetLatLng.lat},${targetLatLng.lng}`;
        window.open(mapsUrl, '_blank');
    });
}

// Camera control helper targeting adaptive boundaries boxes
function zoomToUserAndVehicle(vehicleLatLng) {
    if (lastKnownUserPos) {
        const bounds = L.latLngBounds([lastKnownUserPos, vehicleLatLng]);
        map.fitBounds(bounds.pad(0.25), { maxZoom: 17, animate: true });
    } else {
        map.setView(vehicleLatLng, 16, { animate: true });
    }
}

function showAllVehicles() {
    Object.keys(markerLookup).forEach(vName => {
        const marker = markerLookup[vName];
        marker.setOpacity(1);
        const vanNumber = vName.match(/\d+(?!.*\d)/)?.[0] || "";
        marker.setIcon(buildIcon(vName, vanNumber));
        if (!map.hasLayer(marker)) marker.addTo(map);
    });
    
    if (Object.keys(markerLookup).length > 0) {
        const group = L.featureGroup(Object.values(markerLookup));
        map.fitBounds(group.getBounds().pad(0.1));
    }
}
