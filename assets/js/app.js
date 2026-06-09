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
                html: '<div class="pulse-dot" style="width:12px; height:12px; background:#1e88e5; border:2px solid white; border-radius:50%; box-shadow:0 0 8px #1e88e5;"></div>',
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
    const getVehicleName = (v) => v.name || v.id || v.vehicle_name || v.label || "Unknown Asset";
    const currentNames = vehicles.map(v => getVehicleName(v));

    // Remove any markers from the map that are no longer in the feed
    Object.keys(markerLookup).forEach(name => {
        if (!currentNames.includes(name)) {
            map.removeLayer(markerLookup[name]);
            delete markerLookup[name];
        }
    });

    vehicles.forEach(vehicle => {
        // Safe check: look inside vehicle.gps if it exists, otherwise fall back to top level
        const gpsData = vehicle.gps || {};
        
        const latRaw = gpsData.latitude || gpsData.lat || vehicle.latitude || vehicle.lat;
        const lngRaw = gpsData.longitude || gpsData.lng || gpsData.lon || vehicle.longitude || vehicle.lon;
        
        const lat = parseFloat(latRaw);
        const lng = parseFloat(lngRaw);
        
        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`Skipping ${getVehicleName(vehicle)}: Invalid coordinates (${latRaw}, ${lngRaw})`);
            return;
        }

        const pos = [lat, lng];
        const vehicleName = getVehicleName(vehicle);
        const vanNumber = vehicleName.match(/\d+(?!.*\d)/)?.[0] || "";

        // If filtering is enabled, regulate opacities/visibilities natively
        let opacity = 1;
        let isVisible = true;

        if (selectedVehicleName) {
            if (vehicleName === selectedVehicleName) {
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

        if (!markerLookup[vehicleName]) {
            // New Vehicle Marker Entry
            const marker = L.marker(pos, {
                icon: buildIcon(vehicleName, vanNumber),
                opacity: opacity
            });
            
            if (isVisible) marker.addTo(map);

            marker.bindPopup(`
                <div style="font-family:system-ui, sans-serif; font-size:13px;">
                    <strong style="font-size:14px; color:#1e88e5;">${vehicleName}</strong><br/>
                    <span style="color:#666;">Driver:</span> ${vehicle.driver || 'Unassigned'}<br/>
                    <span style="color:#666;">Last Updated:</span> ${gpsData.dateTime || vehicle.time || 'Just now'}
                </div>
            `);
            
            markerLookup[vehicleName] = marker;
        } else {
            // Existing Vehicle Update Route
            const marker = markerLookup[vehicleName];
            marker.setLatLng(pos);
            marker.setOpacity(opacity);
            marker.setIcon(buildIcon(vehicleName, vanNumber));

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
    const pinColor = isSelected ? '#e53935' : '#1e88e5';
    
    return L.divIcon({
        className: 'custom-van-marker',
        html: `
            <div style="
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center;
                width: 50px;
                height: 45px;
            ">
                <div style="
                    background: ${pinColor};
                    color: white;
                    font-weight: bold;
                    font-size: 11px;
                    font-family: system-ui, sans-serif;
                    padding: 2px 6px;
                    border-radius: 8px;
                    border: 1px solid white;
                    white-space: nowrap;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    line-height: 12px;
                ">${vanNumber ? 'Van ' + vanNumber : 'Asset'}</div>
                <div style="
                    width: 8px;
                    height: 8px;
                    background: ${pinColor};
                    border: 1px solid white;
                    border-radius: 50%;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    margin-top: 2px;
                "></div>
            </div>
        `,
        iconSize: [50, 45],
        iconAnchor: [25, 45]
    });
}

// -----------------------------------------------------
// DROPDOWN FILTERING + 10m PROXIMITY LOGIC
// -----------------------------------------------------
function populateDropdown(vehicles) {
    const dropdown = document.getElementById("vehicleDropdown");
    if (!dropdown) return;

    const currentSelection = dropdown.value;
    const getVehicleName = (v) => v.name || v.id || v.vehicle_name || v.label || "Unknown Asset";

    dropdown.innerHTML = '<option value="__show_all__">📱 Show All Vehicles</option>';

    vehicles.sort((a, b) => getVehicleName(a).localeCompare(getVehicleName(b), undefined, { numeric: true })).forEach(vehicle => {
        const vehicleName = getVehicleName(vehicle);
        const opt = document.createElement("option");
        opt.value = vehicleName;
        opt.textContent = `${vehicleName} (${vehicle.driver || 'No Driver'})`;
        dropdown.appendChild(opt);
    });

    if (currentSelection && vehicles.some(v => getVehicleName(v) === currentSelection)) {
        dropdown.value = currentSelection;
    } else if (selectedVehicleName) {
        dropdown.value = selectedVehicleName;
    }
}

// Dynamic elements binding verified securely
const vehicleDropdown = document.getElementById("vehicleDropdown");
if (vehicleDropdown) {
    vehicleDropdown.addEventListener("change", e => {
        const resetButton = document.getElementById("resetButton");
        const navButton = document.getElementById("navButton");
        const name = e.target.value;

        if (name === "__show_all__") {
            selectedVehicleName = null;
            trackingSelectedVehicle = false;
            if (navButton) navButton.style.display = "none";
            if (resetButton) resetButton.style.display = "none";
            fetchData(); 
            return;
        }

        if (resetButton) resetButton.style.display = "block";
        if (navButton) navButton.style.display = "block";
        selectedVehicleName = name;
        trackingSelectedVehicle = true;

        fetchData(); 
    });
}

const resetButton = document.getElementById("resetButton");
if (resetButton) {
    resetButton.addEventListener("click", () => {
        selectedVehicleName = null;
        trackingSelectedVehicle = false;
        
        const dropdown = document.getElementById("vehicleDropdown");
        const navButton = document.getElementById("navButton");

        if (dropdown) dropdown.value = "__show_all__";
        if (resetButton) resetButton.style.display = "none";
        if (navButton) navButton.style.display = "none";

        fetchData();
    });
}

const navButton = document.getElementById("navButton");
if (navButton) {
    navButton.addEventListener("click", () => {
        if (!selectedVehicleName || !markerLookup[selectedVehicleName]) return;
        const targetLatLng = markerLookup[selectedVehicleName].getLatLng();
        
        // Corrected modern string template configuration
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${targetLatLng.lat},${targetLatLng.lng}`;
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
