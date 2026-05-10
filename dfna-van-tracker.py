import os
import json
import requests
from datetime import datetime

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------

GEOTAB_SERVER = "https://my.geotab.com/apiv1"

USERNAME = os.getenv("GEOTAB_USERNAME", "kellyg@danfosscouriers.ca")
PASSWORD = os.getenv("GEOTAB_PASSWORD")
DATABASE = "dan_foss"

if not PASSWORD:
    raise Exception("GEOTAB_PASSWORD environment variable is missing.")

# ---------------------------------------------------------
# GEOTAB JSON-RPC CALL
# ---------------------------------------------------------

def geotab_call(method, params):
    payload = {
        "method": method,
        "params": params,
        "id": 1
    }
    response = requests.post(GEOTAB_SERVER, json=payload)
    return response.json()

# ---------------------------------------------------------
# LOGIN
# ---------------------------------------------------------

def geotab_login():
    params = {
        "userName": USERNAME,
        "password": PASSWORD,
        "database": DATABASE
    }

    result = geotab_call("Authenticate", params)

    if "error" in result:
        raise Exception(f"Geotab authentication failed: {result}")

    creds = result["result"]["credentials"]
    session_id = creds["sessionId"]
    server = result.get("path", GEOTAB_SERVER)

    return session_id, server

# ---------------------------------------------------------
# GET ALL DEVICES
# ---------------------------------------------------------

def get_devices(session_id):
    params = {
        "typeName": "Device",
        "credentials": {
            "database": DATABASE,
            "sessionId": session_id,
            "userName": USERNAME
        }
    }

    result = geotab_call("Get", params)

    if "error" in result:
        raise Exception(f"Device fetch failed: {result}")

    return result["result"]

# ---------------------------------------------------------
# GET MOST RECENT FuelTaxDetail FOR A DEVICE
# ---------------------------------------------------------

def get_latest_fueltax(session_id, device_id):
    params = {
        "typeName": "FuelTaxDetail",
        "search": {
            "deviceSearch": {"id": device_id}
        },
        "credentials": {
            "database": DATABASE,
            "sessionId": session_id,
            "userName": USERNAME
        }
    }

    result = geotab_call("Get", params)

    if "error" in result:
        return None

    records = result["result"]
    if not records:
        return None

    # Sort by exitTime (most recent last)
    records.sort(key=lambda x: x.get("exitTime", ""))

    latest = records[-1]

    return {
        "latitude": latest.get("exitLatitude"),
        "longitude": latest.get("exitLongitude"),
        "dateTime": latest.get("exitTime")
    }

# ---------------------------------------------------------
# MAIN WORKFLOW
# ---------------------------------------------------------

def main():
    print("Authenticating...")
    session_id, server = geotab_login()
    print("Authenticated.")

    print("Fetching devices...")
    devices = get_devices(session_id)
    print(f"Found {len(devices)} devices.")

    fleet_output = []

    for d in devices:
        device_id = d["id"]
        name = d.get("name", "Unknown")

        gps = get_latest_fueltax(session_id, device_id)

        fleet_output.append({
            "id": device_id,
            "name": name,
            "gps": gps
        })

    # Write JSON output for your PWA
    with open("locations.json", "w") as f:
        json.dump(fleet_output, f, indent=2)

    print("locations.json updated successfully.")

if __name__ == "__main__":
    main()
