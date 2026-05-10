import os
import json
import requests
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------

GEOTAB_SERVER = "https://my.geotab.com/apiv1"

USERNAME = os.getenv("GEOTAB_USERNAME")
PASSWORD = os.getenv("GEOTAB_PASSWORD")
DATABASE = "dan_foss"

if not USERNAME:
    raise Exception("GEOTAB_USERNAME environment variable is missing.")
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
    return result["result"]

# ---------------------------------------------------------
# FuelTaxDetail (entry + exit)
# ---------------------------------------------------------

def get_fueltax_details(session_id, device_id):
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
    records = result.get("result", [])

    if not records:
        return None

    records.sort(key=lambda x: x.get("exitTime") or x.get("entryTime") or "")

    latest = records[-1]

    return {
        "entryTime": latest.get("entryTime"),
        "exitTime": latest.get("exitTime"),
        "entryLat": latest.get("entryLatitude"),
        "entryLon": latest.get("entryLongitude"),
        "exitLat": latest.get("exitLatitude"),
        "exitLon": latest.get("exitLongitude")
    }

# ---------------------------------------------------------
# LogRecord (raw GPS pings)
# ---------------------------------------------------------

def get_latest_logrecord(session_id, device_id):
    from_date = (datetime.now(tz=timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

    params = {
        "typeName": "LogRecord",
        "search": {
            "deviceSearch": {"id": device_id},
            "fromDate": from_date
        },
        "credentials": {
            "database": DATABASE,
            "sessionId": session_id,
            "userName": USERNAME
        }
    }

    result = geotab_call("Get", params)
    logs = result.get("result", [])

    if not logs:
        return None

    latest = logs[-1]

    return {
        "dateTime": latest.get("dateTime"),
        "lat": latest.get("latitude"),
        "lon": latest.get("longitude")
    }

# ---------------------------------------------------------
# DeviceStatusInfo (last known position)
# ---------------------------------------------------------

def get_statusinfo(session_id, device_id):
    params = {
        "typeName": "DeviceStatusInfo",
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
    info = result.get("result", [])

    if not info:
        return None

    latest = info[0]

    return {
        "dateTime": latest.get("dateTime"),
        "lat": latest.get("latitude"),
        "lon": latest.get("longitude")
    }

# ---------------------------------------------------------
# MAIN WORKFLOW
# ---------------------------------------------------------

def main():
    print("Authenticating...")
    session_id, server = geotab_login()
    print("Authenticated.\n")

    print("Fetching devices...")
    devices = get_devices(session_id)
    print(f"Found {len(devices)} devices.\n")

    print("===== BEGIN DIAGNOSTICS =====\n")

    fleet_output = []
    THIRTY_DAYS_AGO = datetime.now(tz=timezone.utc) - timedelta(days=30)

    for d in devices:
        device_id = d["id"]
        name = d.get("name", "Unknown")

        # FILTER 1: Only DFNA vehicles
        if "DFNA" not in name.upper():
            continue

        fueltax = get_fueltax_details(session_id, device_id)
        logrec = get_latest_logrecord(session_id, device_id)
        status = get_statusinfo(session_id, device_id)

        print(f"--- {name} ({device_id}) ---")
        print("FuelTaxDetail:", fueltax)
        print("LogRecord:", logrec)
        print("DeviceStatusInfo:", status)
        print()

        # Determine freshest timestamp
        timestamps = []

        if fueltax and fueltax.get("exitTime"):
            timestamps.append(fueltax["exitTime"])
        if logrec and logrec.get("dateTime"):
            timestamps.append(logrec["dateTime"])
        if status and status.get("dateTime"):
            timestamps.append(status["dateTime"])

        if not timestamps:
            continue

        parsed_times = []
        for t in timestamps:
            try:
                parsed_times.append(datetime.fromisoformat(t.replace("Z", "+00:00")))
            except:
                pass

        if not parsed_times:
            continue

        newest = max(parsed_times)

        # FILTER 2: Only vehicles active in last 30 days
        if newest < THIRTY_DAYS_AGO:
            continue

        # Choose best GPS source
        gps = None

        if fueltax and fueltax.get("exitLat") and fueltax.get("exitLon"):
            gps = {
                "latitude": fueltax["exitLat"],
                "longitude": fueltax["exitLon"],
                "dateTime": fueltax["exitTime"]
            }
        elif logrec:
            gps = {
                "latitude": logrec["lat"],
                "longitude": logrec["lon"],
                "dateTime": logrec["dateTime"]
            }
        elif status:
            gps = {
                "latitude": status["lat"],
                "longitude": status["lon"],
                "dateTime": status["dateTime"]
            }

        if gps:
            fleet_output.append({
                "id": device_id,
                "name": name,
                "gps": gps
            })

    print("===== END DIAGNOSTICS =====\n")

    os.makedirs("data", exist_ok=True)

    with open("data/locations.json", "w") as f:
        json.dump(fleet_output, f, indent=2)

    print("data/locations.json updated successfully.")

if __name__ == "__main__":
    main()
