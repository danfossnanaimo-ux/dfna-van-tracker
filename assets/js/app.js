// -----------------------------------------------------
// GLOBAL VARIABLES & CONFIGURATION
// -----------------------------------------------------
let map;
let vanMarker = null;
let userMarker = null;
let yardBoundaryLayer = null;
let proximityCircle = null; // Tracks the 10m dynamic visual circle

let vanLat = null;
let vanLng = null;
let userLat = null;
let userLng = null;
let vanReady = false;
let userReady = false;
let userWatchId = null;
let selectedVehicleName = null;
let trackingSelectedVehicle = true;
let markerLookup = {};

/* YARD BOUNDARY COORDINATES */
const yardBoundaryCoords = [
    [49.04099970424841, -123.86796072616107],
    [49.04104856987419, -123.8678059019293],
    [49.041067364333145, -123.865328714224],
    [49.04103729319556, -123.86520256114628],
    [49.04099594535228, -123.86513948460765],
    [49.04029302675602, -123.86516242153071],
    [49.04014266854696, -123.86700310961727],
    [49.04099970424841, -123.86796072616107]
];

// -----------------------------------------------------
// MAP INITIALIZATION
// -----------------------------------------------------
window.addEventListener("load", () => {
    requestAnimationFrame(() => {
        requestAnimationFrame(initMap);
    });
});

function initMap() {
    const vanVIN = localStorage.getItem("dfnaVIN");
    
    // Initialize map container
    map = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 20 });
    
    // Add base tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
        maxZoom: 20 
    }).addTo(map);

    // DRAW PERMANENT YARD BOUNDARY
    yardBoundaryLayer = L.polygon(yardBoundaryCoords, {
        color: "#ff0000",      // Red outline matching your specifications
        weight: 3,
        fillColor: "#ff0000",
        fillOpacity: 0.15
    }).addTo(map);

    // Kick off data polling and user tracking
    fetchLocations(); 
    setInterval(fetchLocations, 5000); // Poll server every 5s
    startUserWatch();
}

// -----------------------------------------------------
// MARKER UPDATES & PROXIMITY HALO LOGIC
// -----------------------------------------------------
function updateMarkers(vehicles) {
    // Basic marker rendering step loop
    vehicles.forEach(vehicle => {
        const vehicleName = vehicle.name || vehicle.id || "Unknown Asset";
        const pos = [vehicle.gps.latitude, vehicle.gps.longitude];
        
        let opacity = 1.0;
        let isVisible = true;

        // Apply proximity isolation rules if a specific asset is selected
        if (selectedVehicleName) {
            if (vehicleName === selectedVehicleName) {
                opacity = 1.0;
            } else {
                const selMarker = markerLookup[selectedVehicleName];
                if (selMarker) {
                    const dist = selMarker.getLatLng().distanceTo(L.latLng(pos));
                    if (dist <= 10) {
                        opacity = 0.3; // Dim background noise nearby
                    } else {
                        isVisible = false; // Hide completely if further than 10m
                    }
                }
            }
        }

        // Manage marker visibility on map layer
        if (isVisible) {
            if (!markerLookup[vehicleName]) {
                markerLookup[vehicleName] = L.marker(pos, { icon: vanIcon(vehicleName.split(" ")[0]) }).addTo(map);
            } else {
                markerLookup[vehicleName].setLatLng(pos);
            }
            markerLookup[vehicleName].setOpacity(opacity);
        } else {
            if (markerLookup[vehicleName]) {
                map.removeLayer(markerLookup[vehicleName]);
                delete markerLookup[vehicleName];
            }
        }
    });

    // DYNAMIC 10m RADIUS DRAW LOGIC
    if (trackingSelectedVehicle && selectedVehicleName && markerLookup[selectedVehicleName]) {
        const selectedLatLng = markerLookup[selectedVehicleName].getLatLng();
        
        if (!proximityCircle) {
            proximityCircle = L.circle(selectedLatLng, {
                radius: 10,         // Rigid 10m physical limit
                color: '#e53935',   // Crimson halo edge
                fillColor: '#e53935',
                fillOpacity: 0.1,
                weight: 1.5,
                dashArray: '5, 5'   // Dashed border styling
            }).addTo(map);
        } else {
            proximityCircle.setLatLng(selectedLatLng);
        }
        
        zoomToUserAndVehicle(selectedLatLng);
    } else {
        // Clear active proximity circle if dropdown selection is removed
        if (proximityCircle) {
            map.removeLayer(proximityCircle);
            proximityCircle = null;
        }

        if (!selectedVehicleName && Object.keys(markerLookup).length > 0 && !lastKnownUserPos) {
            const group = L.featureGroup(Object.values(markerLookup));
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

// -----------------------------------------------------
// DROPDOWN FILTERING
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

// Handle changes when a user selects an item from your dropdown UI menu
function onDropdownChange(e) {
    const val = e.target.value;
    if (val === "__show_all__") {
        selectedVehicleName = null;
    } else {
        selectedVehicleName = val;
    }
    fetchLocations(); // Immediately recalculate maps visual layer representation
}

// -----------------------------------------------------
// HELPER MAP UTILITIES (API FALLBACKS)
// -----------------------------------------------------
function fetchLocations() {
    fetch("/dfna-van-tracker-dev/data/locations.json")
        .then(res => res.json())
        .then(data => {
            populateDropdown(data);
            updateMarkers(data);
        })
        .catch(err => console.error("Error pooling vehicle assets:", err));
}

function startUserWatch() {
    if (!navigator.geolocation) return;
    userWatchId = navigator.geolocation.watchPosition(pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        if (!userMarker) {
            userMarker = L.marker([userLat, userLng], { icon: userIcon() }).addTo(map);
        } else {
            userMarker.setLatLng([userLat, userLng]);
        }
        userReady = true;
    }, err => {
        console.warn("User Location tracking failed:", err);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
}

function zoomToUserAndVehicle(selectedLatLng) {
    if (userReady && userLat && userLng) {
        const bounds = L.latLngBounds([selectedLatLng, [userLat, userLng]]);
        map.fitBounds(bounds.pad(0.2));
    } else {
        map.setView(selectedLatLng, 18);
    }
}

function vanIcon(number) {
    return L.divIcon({
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#1976d2;color:white;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.4);">${number}</div>`,
        className: "", iconSize: [34, 34]
    });
}

function userIcon() {
    return L.divIcon({
        html: '<div style="position:relative;width:34px;height:34px;"><div style="position:absolute;top:50%;left:50%;width:20px;height:20px;background:#00e676;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(0,230,118,0.9);"></div></div>',
        className: "", iconSize: [34, 34]
    });
}
