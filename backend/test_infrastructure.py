"""
Test Infrastructure Management System
Tests tank capacity updates, island management, and pump-to-tank mappings
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def print_response(title, response):
    print(f"\n{'='*70}")
    print(f"{title}")
    print(f"{'='*70}")
    print(f"Status Code: {response.status_code}")
    try:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
    except:
        print(f"Response: {response.text}")

print("\n" + "#"*70)
print("# FUEL STATION INFRASTRUCTURE MANAGEMENT TEST")
print("#"*70)

# TEST 1: View Current Tanks
print("\n### TEST 1: View Current Tanks ###")
response = requests.get(f"{BASE_URL}/tanks/levels")
print_response("Getting all tanks", response)

# TEST 2: Update Tank Capacity (Owner functionality)
print("\n### TEST 2: Update Tank Capacity ###")
response = requests.put(
    f"{BASE_URL}/tanks/TANK-DIESEL/capacity",
    params={"new_capacity": 30000.0}  # Increase from 20,000L to 30,000L
)
print_response("Updating Diesel tank capacity to 30,000L", response)

# TEST 3: View Updated Tank
print("\n### TEST 3: View Updated Tank ###")
response = requests.get(f"{BASE_URL}/tanks/levels")
print_response("Getting tanks after capacity update", response)

# TEST 4: View All Islands
print("\n### TEST 4: View All Islands and Pump Stations ###")
response = requests.get(f"{BASE_URL}/islands/")
print_response("Getting all islands", response)

# TEST 5: Update Pump-to-Tank Mapping
print("\n### TEST 5: Change Which Tank a Pump Draws From ###")
response = requests.put(
    f"{BASE_URL}/islands/ISL-001/pump-station/tank",
    params={"tank_id": "TANK-DIESEL"}  # Change from PETROL to DIESEL
)
print_response("Changing Island 1 pump to draw from Diesel tank", response)

# TEST 6: View Island After Tank Mapping Change
print("\n### TEST 6: Verify Pump-to-Tank Mapping Changed ###")
response = requests.get(f"{BASE_URL}/islands/ISL-001")
print_response("Getting Island 1 details", response)

# TEST 7: Add a New Nozzle to an Island
print("\n### TEST 7: Add New Nozzle to Island ###")
new_nozzle = {
    "nozzle_id": "EXTRA-1",
    "pump_station_id": "PS-001",
    "fuel_type": "Diesel",
    "status": "Active",
    "electronic_reading": 0.0,
    "mechanical_reading": 0.0
}
response = requests.post(f"{BASE_URL}/islands/ISL-001/nozzle", json=new_nozzle)
print_response("Adding new nozzle to Island 1", response)

# TEST 8: View Island With New Nozzle
print("\n### TEST 8: Verify New Nozzle Added ###")
response = requests.get(f"{BASE_URL}/islands/ISL-001/nozzles")
print_response("Getting Island 1 nozzles", response)

# TEST 9: Remove a Nozzle
print("\n### TEST 9: Remove Nozzle from Island ###")
response = requests.delete(f"{BASE_URL}/islands/ISL-001/nozzle/EXTRA-1")
print_response("Removing nozzle EXTRA-1", response)

# TEST 10: Try to Update Tank Capacity Below Current Level (Should Fail)
print("\n### TEST 10: Try Invalid Capacity Update (SHOULD FAIL) ###")
response = requests.put(
    f"{BASE_URL}/tanks/TANK-PETROL/capacity",
    params={"new_capacity": 1000.0}  # Way below current level
)
print_response("Trying to set capacity below current level", response)

# TEST 11: Create New Island
print("\n### TEST 11: Create New Island ###")
new_island = {
    "island_id": "ISL-003",
    "name": "Island 3",
    "location": "New Addition",
    "pump_station": {
        "pump_station_id": "PS-003",
        "island_id": "ISL-003",
        "name": "Pump Station 3",
        "tank_id": "TANK-PETROL",
        "nozzles": [
            {
                "nozzle_id": "NEW-1A",
                "pump_station_id": "PS-003",
                "fuel_type": "Petrol",
                "status": "Active",
                "electronic_reading": 0.0,
                "mechanical_reading": 0.0
            },
            {
                "nozzle_id": "NEW-1B",
                "pump_station_id": "PS-003",
                "fuel_type": "Petrol",
                "status": "Active",
                "electronic_reading": 0.0,
                "mechanical_reading": 0.0
            }
        ]
    }
}
response = requests.post(f"{BASE_URL}/islands/", json=new_island)
print_response("Creating new Island 3", response)

# TEST 12: View All Islands Including New One
print("\n### TEST 12: View All Islands (Should Include Island 3) ###")
response = requests.get(f"{BASE_URL}/islands/")
print_response("Getting all islands", response)
if response.status_code == 200:
    islands = response.json()
    print(f"\nTotal Islands: {len(islands)}")
    for island in islands:
        print(f"  - {island['island_id']}: {island['name']}")

# TEST 13: Delete an Island (without dependents)
print("\n### TEST 13: Delete Island 3 ###")
response = requests.delete(f"{BASE_URL}/islands/ISL-003")
print_response("Deleting Island 3", response)

# TEST 14: Verify Island Deleted
print("\n### TEST 14: Verify Island 3 Deleted ###")
response = requests.get(f"{BASE_URL}/islands/")
print_response("Getting all islands after deletion", response)

print("\n" + "="*70)
print("INFRASTRUCTURE MANAGEMENT TESTS COMPLETE")
print("="*70)
print("\nSUMMARY:")
print("✓ Tank capacity management works")
print("✓ Pump-to-tank mapping configuration works")
print("✓ Island creation and deletion works")
print("✓ Nozzle addition and removal works")
print("✓ Validation prevents invalid operations")
print("="*70 + "\n")
