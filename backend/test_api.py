"""
Quick API Test Script
Tests the validation system via HTTP API calls
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def print_response(title, response):
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"Status Code: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text}")

# Test 1: Create a shift
print("\n### TEST 1: Create a valid shift ###")
shift_data = {
    "shift_id": "SHIFT-API-001",
    "date": "2025-12-19",
    "shift_type": "Day",
    "attendants": ["John", "Jane"],
    "status": "active"
}
response = requests.post(f"{BASE_URL}/shifts/", json=shift_data)
print_response("Creating shift", response)

# Test 2: Create an account
print("\n### TEST 2: Create a valid account ###")
account_data = {
    "account_id": "ACC-API-001",
    "account_name": "Test Corporation",
    "account_type": "Corporate",
    "credit_limit": 50000.0,
    "current_balance": 0.0
}
response = requests.post(f"{BASE_URL}/accounts/", json=account_data)
print_response("Creating account", response)

# Test 3: Create credit sale with INVALID shift_id (should fail with 400)
print("\n### TEST 3: Create credit sale with INVALID shift_id (SHOULD FAIL) ###")
invalid_sale = {
    "sale_id": "SALE-INVALID-001",
    "account_id": "ACC-API-001",
    "shift_id": "SHIFT-DOES-NOT-EXIST",  # Invalid!
    "date": "2025-12-19",
    "fuel_type": "Diesel",
    "volume": 100.0,
    "amount": 2698.0
}
response = requests.post(f"{BASE_URL}/accounts/sales", json=invalid_sale)
print_response("Creating credit sale with invalid shift_id", response)

# Test 4: Create credit sale with VALID IDs (should succeed)
print("\n### TEST 4: Create credit sale with VALID IDs (SHOULD SUCCEED) ###")
valid_sale = {
    "sale_id": "SALE-VALID-001",
    "account_id": "ACC-API-001",
    "shift_id": "SHIFT-API-001",  # Valid!
    "date": "2025-12-19",
    "fuel_type": "Diesel",
    "volume": 100.0,
    "amount": 2698.0
}
response = requests.post(f"{BASE_URL}/accounts/sales", json=valid_sale)
print_response("Creating credit sale with valid IDs", response)

# Test 5: Try to delete account with dependents (should fail with 409)
print("\n### TEST 5: Delete account with dependents (SHOULD FAIL) ###")
response = requests.delete(f"{BASE_URL}/accounts/ACC-API-001")
print_response("Deleting account with credit sales", response)

# Test 6: Create LPG sale with invalid shift_id (should fail)
print("\n### TEST 6: Create LPG sale with INVALID shift_id (SHOULD FAIL) ###")
lpg_sale = {
    "sale_id": "LPG-INVALID-001",
    "shift_id": "SHIFT-INVALID",  # Invalid!
    "cylinder_size": "13kg",
    "quantity_kg": 13.0,
    "price_per_kg": 25.0,
    "total_amount": 325.0,
    "sale_type": "Refill"
}
response = requests.post(f"{BASE_URL}/lpg/sales", json=lpg_sale)
print_response("Creating LPG sale with invalid shift_id", response)

# Test 7: Create LPG sale with valid shift_id (should succeed)
print("\n### TEST 7: Create LPG sale with VALID shift_id (SHOULD SUCCEED) ###")
lpg_sale_valid = {
    "sale_id": "LPG-VALID-001",
    "shift_id": "SHIFT-API-001",  # Valid!
    "cylinder_size": "13kg",
    "quantity_kg": 13.0,
    "price_per_kg": 25.0,
    "total_amount": 325.0,
    "sale_type": "Refill"
}
response = requests.post(f"{BASE_URL}/lpg/sales", json=lpg_sale_valid)
print_response("Creating LPG sale with valid shift_id", response)

print("\n" + "="*60)
print("API VALIDATION TESTING COMPLETE")
print("="*60)
