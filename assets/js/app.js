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
        // pad(0.25) can sometimes push calculations past maxZoom on small viewports
        map.fitBounds(bounds, { maxZoom: 18, padding: [30, 30] });
    } else {
        map.setView(selectedLatLng, 18); // Kept safely below zoom level 19
    }
}

// ACTION HANDLER FOR OPENING MAP DIRECTIONS
function openDirectionsLink() {
    if (!selectedVehicleName) return;

    const targetedVehicle = latestVehiclesData.find(v => (v.name || v.id || "") === selectedVehicleName);
    if (!targetedVehicle || !targetedVehicle.gps) {
        alert("Could not pull location data metrics for this asset.");
        return;
    }

    const lat = targetedVehicle.gps.latitude;
    const lng = targetedVehicle.gps.longitude;
    
    // Clean, proper Google Maps URL structures (No broken brackets or weird domains)
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
