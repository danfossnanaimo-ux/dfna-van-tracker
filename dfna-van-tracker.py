import os
import json
import requests
from datetime import datetime

GEOTAB_SERVER = "https://my.geotab.com/apiv1"

USERNAME = os.getenv("GEOTAB_USERNAME", "kdwgray@gmail.com")
PASSWORD = os.getenv("GEOTAB_PASSWORD")
DATABASE = "dan_foss"

if not PASSWORD:
    raise Exception("GEOTAB_PASSWORD environment variable is missing.")

print("Logging into Geotab...")
print(f"DEBUG: Password length = {len(PASSWORD)}")
print(f"DEBUG: First 3 chars = {PASSWORD[:3]}")
print(f"DEBUG: Last 2 chars = {PASSWORD[-2:]}")
print(f"DEBUG: Username = {USERNAME}")
print(f"DEBUG: Database = {DATABASE}")
print(f"DEBUG: repr password = '{PASSWORD[:1]}**'")

# ---------------------------------------------------------
# GEOTAB CALL WITH FULL DEBUGGING
# ---------------------------------------------------------
def geotab_call(method, params):
    payload = {
        "method": method,
        "params": params,
        "id": 1
    }

    # 🔥 FULL DEBUGGING — EXACT SPOT 🔥
    print("\n================ DEBUG REQUEST ================")
    print("URL:", GEOTAB_SERVER)
    print("Payload:")
    print(json.dumps(payload, indent=2))
    print("===============================================\n")

    response = requests.post(GEOTAB_SERVER, json=payload)

    # 🔥 RAW RESPONSE
    print("DEBUG RAW RESPONSE:", response.text)

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
        raise Exception(f"Unexpected Geotab response: {result}")

    creds = result["result"]["credentials"]
    session_id = creds["sessionId"]
    server = result.get("path", GEOTAB_SERVER)

    return session_id, server

# ---------------------------------------------------------
# MAIN
# ---------------------------------------------------------
def main():
    session_id, server = geotab_login()

    print("Authenticated successfully.")
    print("Session ID:", session_id)
    print("Server:", server)

    # You can add more logic here later.
    # For now, we only need authentication debugging.

if __name__ == "__main__":
    main()
