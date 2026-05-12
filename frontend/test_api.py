import sys
import json
import urllib.request
import urllib.error

url = 'http://localhost:5000/api/classes/create_with_sections'
data = {
    "class_name": "6",
    "branch_id": 1,
    "academic_year": "2025-26",
    "sections": [{"name": "HA2", "strength": 40}]
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})

try:
    response = urllib.request.urlopen(req)
    print("Success:", response.read().decode())
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode()}")
except Exception as e:
    print("Error:", e)
