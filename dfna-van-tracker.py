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

        # Build list of candidate timestamps with source tags
        candidates = []

        if fueltax and fueltax.get("exitTime") and fueltax.get("exitLat") and fueltax.get("exitLon"):
            candidates.append(("fueltax", fueltax["exitTime"], fueltax))
        if logrec and logrec.get("dateTime") and logrec.get("lat") and logrec.get("lon"):
            candidates.append(("logrec", logrec["dateTime"], logrec))
        if status and status.get("dateTime") and status.get("lat") and status.get("lon"):
            candidates.append(("status", status["dateTime"], status))

        if not candidates:
            continue

        # Parse timestamps and keep mapping to source
        parsed = []
        for source, ts, payload in candidates:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                parsed.append((dt, source, payload))
            except:
                continue

        if not parsed:
            continue

        # Pick freshest source
        newest_dt, newest_source, newest_payload = max(parsed, key=lambda x: x[0])

        # FILTER 2: Only vehicles active in last 30 days (based on freshest source)
        if newest_dt < THIRTY_DAYS_AGO:
            continue

        # Build gps from the same freshest source
        if newest_source == "fueltax":
            gps = {
                "latitude": newest_payload["exitLat"],
                "longitude": newest_payload["exitLon"],
                "dateTime": newest_payload["exitTime"]
            }
        elif newest_source == "logrec":
            gps = {
                "latitude": newest_payload["lat"],
                "longitude": newest_payload["lon"],
                "dateTime": newest_payload["dateTime"]
            }
        else:  # "status"
            gps = {
                "latitude": newest_payload["lat"],
                "longitude": newest_payload["lon"],
                "dateTime": newest_payload["dateTime"]
            }

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
