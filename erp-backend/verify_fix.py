import requests

BASE_URL = "http://127.0.0.1:5001/api"
payload = {"username": "Admin", "password": "temp123"}

print("1. Logging in...")
res = requests.post(f"{BASE_URL}/users/login", json=payload)
if res.status_code != 200:
    print(f"Login failed: {res.status_code} - {res.text}")
    exit(1)

token = res.json().get("token")
print("Login successful! Token received.")

headers = {"Authorization": f"Bearer {token}"}

print("\n2. Querying assigned-subjects...")
res_assigned = requests.get(f"{BASE_URL}/academic/assigned-subjects?academic_year_id=2&branch_id=6", headers=headers)
print(f"Status Code: {res_assigned.status_code}")
print(f"Response: {res_assigned.text[:1000]}")

if res_assigned.status_code == 200:
    print("\nSUCCESS! The bug has been successfully resolved.")
else:
    print("\nFAIL! The bug is still present.")
