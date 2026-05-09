import requests
import json
import os

# -----------------------------
# CONFIGURATION
# -----------------------------
GEOTAB_SERVER = "https://my.geotab.com/apiv1"
GEOTAB_USERNAME = "kellyg@danfosscouriers.ca"
GEOTAB_PASSWORD = os.getenv("GEOTAB_PASSWORD")
GEOTAB_DATABASE = "dan_foss"

OUTPUT_JSON = "data/locations.json"


# -----------------------------
# GENERIC GEOTAB API CALL
# -----------------------------
def geotab_call(method, params=None, server=None):
    if params is None:
        params = {}

    payload = {
        "method": method,
        "params": params,
        "id": 1,
        "jsonrpc": "2.0"
    }

    response = requests.post(server, json=payload)
    response.raise_for_status()
    data = response.json()

    if "result" not in data:
        raise Exception(f"Unexpected Geotab response: {data}")

    return data["result"]


# -----------------------------
# LOGIN (AUTHENTICATE)
# -----------------------------
def geotab_login():
    print("Logging into Geotab...")
    print("DEBUG: Password length =", len(GEOTAB_PASSWORD))
    print("DEBUG: First 3 chars =", GEOTAB_PASSWORD[:3])
    print("DEBUG: Last 2 chars =", GEOTAB_PASSWORD[-2:])

    result = geotab_call(
        "Authenticate",
        {
            "credentials": {
                "database": GEOTAB_DATABASE,
                "userName": GEOTAB_USERNAME,
                "password": GEOTAB_PASSWORD
            }
        },
        GEOTAB_SERVER
    )

    session = result["credentials"]
    session_id = session["sessionId"]
    server = result["path"]  # ALWAYS a full URL like https://myXX.geotab.com/apiv1

    print(f"Login successful. Using server: {server}")
    return session_id, server

# -----------------------------
# GET ALL DFNA VEHICLES
# -----------------------------
def get_all_vehicles(session_id, server):
    print("Fetching vehicles...")

    result = geotab_call(
        "Get",
        {
            "typeName": "Device",
            "credentials": {
                "sessionId": session_id,
                "database": GEOTAB_DATABASE
            }
        },
        server
    )

    vehicles = [v for v in result if "DFNA" in v.get("name", "")]
    print(f"Found {len(vehicles)} DFNA vehicles.")
    return vehicles


# -----------------------------
# GET LAST KNOWN LOCATION
# -----------------------------
def get_last_location(device_id, session_id, server):
    result = geotab_call(
        "Get",
        {
            "typeName": "StatusData",
            "search": {
                "deviceSearch": {"id": device_id},
                "diagnosticSearch": {"id": "DiagnosticLocation"}
            },
            "credentials": {
                "sessionId": session_id,
                "database": GEOTAB_DATABASE
            }
        },
        server
    )

    if not result:
        return None

    latest = result[-1]
    return {
        "lat": latest["data"]["latitude"],
        "lng": latest["data"]["longitude"],
        "timestamp": latest["dateTime"]
    }


# -----------------------------
# MAIN PROCESS
# -----------------------------
def main():
    session_id, server = geotab_login()
    vehicles = get_all_vehicles(session_id, server)

    output = []

    for v in vehicles:
        name = v.get("name", "Unknown")
        print(f"Processing {name}...")

        loc = get_last_location(v["id"], session_id, server)

        if loc:
            output.append({
                "name": name,
                "lat": loc["lat"],
                "lng": loc["lng"],
                "timestamp": loc["timestamp"]
            })

    os.makedirs("data", exist_ok=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"Updated {len(output)} vehicle locations.")
    print("Done.")


# -----------------------------
# RUN
# -----------------------------
if __name__ == "__main__":
    if not GEOTAB_PASSWORD:
        raise Exception("GEOTAB_PASSWORD environment variable is missing.")
    main()
