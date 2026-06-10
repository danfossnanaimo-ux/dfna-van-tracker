// -----------------------------------------------------
// GLOBAL VARIABLES & CONFIGURATION
// -----------------------------------------------------
let map;
let userMarker = null;
let yardBoundaryLayer = null;
let proximityCircle = null; // Tracks the 10m dynamic visual circle

let userLat = null;
let userLng = null;
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
    initMap();
});

function initMap() {
    // Initialize map container centered directly over your yard coordinates
    map = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 20 }).setView([49.0405, -123.8665], 17);
    
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

    // Safely attach event listener to dropdown element
    const dropdown = document.getElementById("vehicleDropdown");
    if (dropdown) {
        dropdown.addEventListener("change", onDropdownChange);
    }

    // Kick off data polling and user tracking
    fetchLocations(); 
    setInterval(fetchLocations, 5000); // Poll server every 5s
    startUserWatch();
}

// -----------------------------------------------------
// MARKER UPDATES & PROXIMITY HALO LOGIC
// -----------------------------------------------------
function updateMarkers(vehicles) {
    if (!vehicles || !Array.isArray(vehicles)) return;

    // First, verify if our active selected vehicle even exists in incoming payload data
    let baseSelectionMarker = null;
    if (selectedVehicleName) {
        const selectedVehicleData = vehicles.find(v => (v.name || v.id || "") === selectedVehicleName);
        if (selectedVehicleData && selectedVehicleData.gps) {
            const selPos = [selectedVehicleData.gps.latitude, selectedVehicleData.gps.longitude];
            // Enforce creation/existence of selected anchor reference point
            if (!markerLookup[selectedVehicleName]) {
                markerLookup[selectedVehicleName] = L.marker(selPos, { icon: vanIcon(selectedVehicleName) }).addTo(map);
            } else {
                markerLookup[selectedVehicleName].setLatLng(selPos);
            }
            baseSelectionMarker = markerLookup[selectedVehicleName];
        }
    }

    // Process all markers inside loop update calculations
    vehicles.forEach(vehicle => {
        const vehicleName = vehicle.name || vehicle.id || "Unknown Asset";
        if (!vehicle.gps) return;
        
        const pos = [vehicle.gps.latitude, vehicle.gps.longitude];
        let opacity = 1.0;
        let isVisible = true;

        // Apply proximity isolation rules if an asset is selected
        if (selectedVehicleName) {
            if (vehicleName === selectedVehicleName) {
                opacity = 1.0;
            } else if (baseSelectionMarker) {
                const dist = baseSelectionMarker.getLatLng().distanceTo(L.latLng(pos));
                if (dist <= 10) {
                    opacity = 0.3; // Dim background noise nearby within 10 meters
                } else {
                    isVisible = false; // Hide completely if further than 10 meters
                }
            }
        }

        // Manage marker visibility on map layer
        if (isVisible) {
            if (!markerLookup[vehicleName]) {
                markerLookup[vehicleName] = L.marker(pos, { icon: vanIcon(vehicleName) }).addTo(map);
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

        if (!selectedVehicleName && Object.keys(markerLookup).length > 0 && !userReady) {
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
    if (!dropdown || !vehicles) return;

    const currentSelection = dropdown.value;
    const getVehicleName = (v) => v.name || v.id || v.vehicle_name || v.label || "Unknown Asset";

    dropdown.innerHTML = '<option value="__show_all__">📱 Show All Vehicles</option>';

    // Create array copy to prevent modifying raw socket payload structures directly during sorting passes
    [...vehicles].sort((a, b) => getVehicleName(a).localeCompare(getVehicleName(b), undefined, { numeric: true })).forEach(vehicle => {
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

// Handle updates directly via cleaner Event Listeners definitions mapping target value configurations
function onDropdownChange(event) {
    const val = event.target.value;
    if (val === "__show_all__") {
        selectedVehicleName = null;
    } else {
        selectedVehicleName = val;
    }
    fetchLocations(); 
}

// -----------------------------------------------------
// HELPER MAP UTILITIES (DATA FETCH)
// -----------------------------------------------------
function fetchLocations() {
    // Relative local pathway fallback routing logic checking layout JSON parameters
    fetch("data/locations.json")
        .then(res => {
            if (!res.ok) throw new Error("Network response was not ok");
            return res.json();
        })
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

function vanIcon(name) {
    // Pull out numbers cleanly for rendering circular markers tags labels representation structures
    const shortLabel = name ? name.toString().split(" ")[0] : "Van";
    return L.divIcon({
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#1976d2;color:white;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.4);">${shortLabel}</div>`,
        className: "", iconSize: [34, 34]
    });
}

function userIcon() {
    return L.divIcon({
        html: '<div style="position:relative;width:34px;height:34px;"><div style="position:absolute;top:50%;left:50%;width:20px;height:20px;background:#00e676;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(0,230,118,0.9);"></div></div>',
        className: "", iconSize: [34, 34]
    });
}
