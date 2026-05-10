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

print("Logging into Geotab...")

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
    data = response.json()
    return data

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
# MAIN WORKFLOW
# ---------------------------------------------------------

def main():
    session_id, server = geotab_login()

    print("Authenticated successfully.")
    print("Session ID:", session_id)
    print("Server:", server)

    # -----------------------------------------------------
    # PLACEHOLDER FOR YOUR ACTUAL VAN TRACKER LOGIC
    # -----------------------------------------------------
    # Example:
    #
    # vehicles = geotab_call("Get", {
    #     "typeName": "Device",
    #     "credentials": {
    #         "database": DATABASE,
    #         "sessionId": session_id,
    #         "userName": USERNAME
    #     }
    # })
    #
    # print("Vehicles:", vehicles)
    #
    # Add your GPS extraction, JSON writing, CSV export, etc.
    # -----------------------------------------------------

if __name__ == "__main__":
    main()
