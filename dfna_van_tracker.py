import requests
import csv
from datetime import datetime

# -----------------------------
# CONFIG
# -----------------------------
server = "https://my.geotab.com/apiv1"
username = "kellyg@danfosscouriers.ca"
password = "Liquid#99liber"
database = "dan_foss"

OUTPUT_CSV = "C:/Users/Kelly/OneDrive - DanFoss Couriers & Freight/Desktop/Geotab Project/dfna_last_locations.csv"
OUTPUT_JS  = "C:/Users/Kelly/OneDrive - DanFoss Couriers & Freight/Desktop/Geotab Project/dfna_last_locations.js"

# -----------------------------
# AUTHENTICATE
# -----------------------------
auth_payload = {
    "method": "Authenticate",
    "params": {
        "userName": username,
        "password": password,
        "database": database
    },
    "id": 1
}

auth = requests.post(server, json=auth_payload).json()
session = auth["result"]["credentials"]

# -----------------------------
# GET ALL DFNA DEVICES
# -----------------------------
device_payload = {
    "method": "Get",
    "params": {
        "typeName": "Device",
        "search": {"name": "%DFNA%"},
        "credentials": session
    },
    "id": 2
}

device_response = requests.post(server, json=device_payload).json()
devices = device_response.get("result", [])

dfna_devices = [
    {"id": d["id"], "name": d["name"]}
    for d in devices
    if "DFNA" in d.get("name", "").upper()
]

print(f"Found {len(dfna_devices)} DFNA vehicles.")

rows = []
markers = []

# -----------------------------
# FOR EACH DFNA DEVICE: LAST FuelTaxDetail
# -----------------------------
def parse_dt(x):
    return datetime.fromisoformat(x["exitTime"].replace("Z", "+00:00"))

for dev in dfna_devices:
    dev_id = dev["id"]
    dev_name = dev["name"]
    print(f"Processing {dev_name}...")

    fuel_payload = {
        "method": "Get",
        "params": {
            "typeName": "FuelTaxDetail",
            "search": {
                "deviceSearch": {"id": dev_id}
            },
            "credentials": session
        },
        "id": 3
    }

    fuel_response = requests.post(server, json=fuel_payload).json()

    if "error" in fuel_response:
        print(f"FuelTaxDetail error for {dev_name}: {fuel_response['error']}")
        continue

    records = fuel_response.get("result", [])
    if not records:
        # No data – still write a row with blanks
        rows.append([dev_name, "", "", ""])
        continue

    latest = sorted(records, key=parse_dt)[-1]

    ts  = latest.get("exitTime", "")
    lat = latest.get("exitLatitude", "")
    lon = latest.get("exitLongitude", "")

    rows.append([dev_name, ts, lat, lon])

    if lat != "" and lon != "":
        markers.append({
            "name": dev_name,
            "timestamp": ts,
            "lat": lat,
            "lon": lon
        })

# -----------------------------
# WRITE CSV
# -----------------------------
with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["name", "timestamp", "latitude", "longitude"])
    writer.writerows(rows)

print("CSV written:", OUTPUT_CSV)

# -----------------------------
# WRITE JS FOR MAP
# -----------------------------
with open(OUTPUT_JS, "w", encoding="utf-8") as f:
    f.write("const vehicleLocations = [\n")
    for m in markers:
        f.write(
            f'  {{ name: "{m["name"]}", timestamp: "{m["timestamp"]}", '
            f'lat: {m["lat"]}, lon: {m["lon"]} }},\n'
        )
    f.write("];\n")

print("JS written:", OUTPUT_JS)
input("Press Enter to exit...")
