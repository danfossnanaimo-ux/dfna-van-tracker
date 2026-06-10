// -----------------------------------------------------
// GLOBAL VARIABLES & STORAGE CONFIGURATIONS
// -----------------------------------------------------
let map;
let userMarker = null;
let yardBoundaryLayer = null;
let proximityCircle = null; // 10-meter isolation layout circle

let userLat = null;
let userLng = null;
let userReady = false;
let userWatchId = null;
let selectedVehicleName = null;
let trackingSelectedVehicle = true;
let markerLookup = {};
let latestVehiclesData = []; 

/* SPECIFIC YARD BOUNDARY COORDINATES PERIMETER */
const yardBoundaryCoords = [
    [49.0409788, -123.8679891],
    [49.0410245, -123.8680052],
    [49.0410947, -123.8679356],
    [49.0411122, -123.7677214], // Fixed zoom limits constraint alignment
    [49.0411052, -123.866538],
    [49.0411122, -123.8659703],
    [49.0411122, -123.8656276],
    [49.0411052, -123.8653385],
    [49.0410876, -123.8651618],
    [49.041056, -123.8650493],
    [49.0409823, -123.8650065],
    [49.0403013, -123.8650279],
    [49.0401223, -123.8670252],
    [49.0409788, -123.8679891]
];

// -----------------------------------------------------
// MAP ENGINE INITIATION ON DOCUMENT LOAD
// -----------------------------------------------------
window.addEventListener("load", () => {
    initMap();
});

function initMap() {
    // Center map view on your yard perimeter coordinates
    map = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 19 }).setView([49.0405, -123.8665], 17);
    
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
        maxZoom: 19 
    }).addTo(map);

    // RENDER THE YARD POLYNOMIAL OVERLAY MAPPING BOUNDS
    yardBoundaryLayer = L.polygon(yardBoundaryCoords, {
        color: "#ff0000",
        weight: 3,
        fillColor: "#ff0000",
        fillOpacity: 0.12
    }).addTo(map);

    // ATTACH EVENT LISTENERS SAFELY
    const dropdown = document.getElementById("vehicleDropdown");
    if (dropdown) dropdown.addEventListener("change", onDropdownChange);

    const resetBtn = document.getElementById("resetButton");
    if (resetBtn) resetBtn.addEventListener("click", resetToAllVehicles);

    const navBtn = document.getElementById("navButton");
    if (navBtn) navBtn.addEventListener("click", openDirectionsLink);

    fetchLocations(); 
    setInterval(fetchLocations, 5000); 
    startUserWatch();
}

// -----------------------------------------------------
// RENDER VEHICLES MARKERS + 10m ISOLATION HALO LOGIC
// -----------------------------------------------------
function updateMarkers(vehicles) {
    if (!vehicles || !Array.isArray(vehicles)) return;
    latestVehiclesData = vehicles; 

    let baseSelectionMarker = null;

    if (selectedVehicleName) {
        const selectedVehicleData = vehicles.find(v => (v.name || v.id || "") === selectedVehicleName);
        if (selectedVehicleData && selectedVehicleData.gps) {
            const selPos = [selectedVehicleData.gps.latitude, selectedVehicleData.gps.longitude];
            if (!markerLookup[selectedVehicleName]) {
                markerLookup[selectedVehicleName] = L.marker(selPos, { icon: vanIcon(selectedVehicleName) }).addTo(map);
            } else {
                markerLookup[selectedVehicleName].setLatLng(selPos);
            }
            baseSelectionMarker = markerLookup[selectedVehicleName];
        }
    }

    vehicles.forEach(vehicle => {
        const vehicleName = vehicle.name || vehicle.id || "Unknown Asset";
        if (!vehicle.gps) return;
        
        const pos = [vehicle.gps.latitude, vehicle.gps.longitude];
        let opacity = 1.0;
        let isVisible = true;

        if (selectedVehicleName) {
            if (vehicleName === selectedVehicleName) {
                opacity = 1.0;
            } else if (baseSelectionMarker) {
                const dist = baseSelectionMarker.getLatLng().distanceTo(L.latLng(pos));
                if (dist <= 10) {
                    opacity = 0.35; 
                } else {
                    isVisible = false; 
                }
            }
        }

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

    if (trackingSelectedVehicle && selectedVehicleName && markerLookup[selectedVehicleName]) {
        const selectedLatLng = markerLookup[selectedVehicleName].getLatLng();
        
        if (!proximityCircle) {
            proximityCircle = L.circle(selectedLatLng, {
                radius: 10,
                color: '#e53935',
                fillColor: '#e53935',
                fillOpacity: 0.1,
                weight: 1.5,
                dashArray: '5, 5'
            }).addTo(map);
        } else {
            proximityCircle.setLatLng(selectedLatLng);
        }
        
        zoomToUserAndVehicle(selectedLatLng);
    } else {
        if (proximityCircle) {
            map.removeLayer(proximityCircle);
            proximityCircle = null;
        }

        if (!selectedVehicleName && Object.keys(markerLookup).length > 0) {
            const validMarkers = Object.values(markerLookup).filter(m => m !== null);
            if (validMarkers.length > 0) {
                const group = L.featureGroup(validMarkers);
                map.fitBounds(group.getBounds().pad(0.1));
            }
        }
    }
}

// -----------------------------------------------------
// DROPDOWN DATA SYNCHRONIZATION FILTERING UI
// -----------------------------------------------------
function populateDropdown(vehicles) {
    const dropdown = document.getElementById("vehicleDropdown");
    if (!dropdown || !vehicles) return;

    const currentSelection = dropdown.value;
    const getVehicleName = (v) => v.name || v.id || v.vehicle_name || v.label || "Unknown Asset";

    dropdown.innerHTML = '<option value="__show_all__">📱 Show All Vehicles</option>';

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

// HERE IS YOUR MISSING DROPDOWN MECHANICS ENGINE WITH DISPLAYS
function onDropdownChange(event) {
    const val = event.target.value;
    const navBtn = document.getElementById("navButton");

    if (val === "__show_all__") {
        selectedVehicleName = null;
        if (navBtn) navBtn.style.display = "none"; 
    } else {
        selectedVehicleName = val;
        if (navBtn) navBtn.style.display = "flex"; 
    }
    fetchLocations(); 
}

function resetToAllVehicles() {
    selectedVehicleName = null;
    const dropdown = document.getElementById("vehicleDropdown");
    if (dropdown) dropdown.value = "__show_all__";
    
    const navBtn = document.getElementById("navButton");
    if (navBtn) navBtn.style.display = "none"; 
    
    fetchLocations();
}

// -----------------------------------------------------
// SYSTEM POLLING AND SERVICE COMPONENT TASKS
// -----------------------------------------------------
function fetchLocations() {
    fetch("data/locations.json")
        .then(res => {
            if (!res.ok) throw new Error("File layer access failed.");
            return res.json();
        })
        .then(data => {
            populateDropdown(data);
            updateMarkers(data);
        })
        .catch(err => console.error("Error pooling asset array details:", err));
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
        console.warn("User GPS access lookup dropped:", err);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 7000 });
}

function zoomToUserAndVehicle(selectedLatLng) {
    if (userReady && userLat && userLng) {
        const bounds = L.latLngBounds([selectedLatLng, [userLat, userLng]]);
        map.fitBounds(bounds, { maxZoom: 18, padding: [30, 30] });
    } else {
        map.setView(selectedLatLng, 18);
    }
}

function openDirectionsLink() {
    if (!selectedVehicleName) return;

    const targetedVehicle = latestVehiclesData.find(v => (v.name || v.id || "") === selectedVehicleName);
    if (!targetedVehicle || !targetedVehicle.gps) {
        alert("Could not pull location data metrics for this asset.");
        return;
    }

    const lat = targetedVehicle.gps.latitude;
    const lng = targetedVehicle.gps.longitude;
    
    const navUrl = (userReady && userLat && userLng) 
        ? `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving` 
        : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        
    window.open(navUrl, '_blank');
}

function vanIcon(name) {
    const shortLabel = name ? name.toString().split(" ")[0] : "Van";
    return L.divIcon({
        html: `<div style="width:34px;height:34px;border-radius:50%;background:#1976d2;color:white;font-weight:bold;display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.45);">${shortLabel}</div>`,
        className: "", iconSize: [34, 34]
    });
}

function userIcon() {
    return L.divIcon({
        html: '<div style="position:relative;width:34px;height:34px;"><div style="position:absolute;top:50%;left:50%;width:18px;height:18px;background:#00e676;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px rgba(0,230,118,0.85);border:2px solid #fff;"></div></div>',
        className: "", iconSize: [34, 34]
    });
}
