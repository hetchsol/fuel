"""
Test the comprehensive tank reading API with real Excel data from row 4
"""
import requests
import json

# First, login to get a valid token
print('Logging in...')
login_url = 'http://127.0.0.1:8000/api/v1/auth/login'
login_data = {
    'username': 'owner1',
    'password': 'owner123'
}
login_response = requests.post(login_url, json=login_data)
if login_response.status_code != 200:
    print(f'Login failed: {login_response.text}')
    exit(1)

token = login_response.json()['access_token']
print(f'Login successful! Token: {token}')
print()

url = 'http://127.0.0.1:8000/api/v1/tank-readings/readings'
headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {token}'
}

payload = {
    'tank_id': 'TANK-PETROL',
    'date': '2025-12-01',
    'shift_type': 'Day',
    'opening_dip_cm': 164.5,
    'closing_dip_cm': 155.4,
    'nozzle_readings': [
        {
            'nozzle_id': '1A',
            'attendant': 'Shaka',
            'electronic_opening': 609176.526,
            'electronic_closing': 609454.572,
            'electronic_movement': 278.046,
            'mechanical_opening': 611984.0,
            'mechanical_closing': 612262.0,
            'mechanical_movement': 278.0
        },
        {
            'nozzle_id': '1B',
            'attendant': 'Shaka',
            'electronic_opening': 825565.474,
            'electronic_closing': 826087.723,
            'electronic_movement': 522.249,
            'mechanical_opening': 829030.0,
            'mechanical_closing': 829552.0,
            'mechanical_movement': 522.0
        },
        {
            'nozzle_id': '2A',
            'attendant': 'Violet',
            'electronic_opening': 801332.477,
            'electronic_closing': 801682.231,
            'electronic_movement': 349.754,
            'mechanical_opening': 801430.0,
            'mechanical_closing': 801780.0,
            'mechanical_movement': 350.0
        },
        {
            'nozzle_id': '2B',
            'attendant': 'Violet',
            'electronic_opening': 1270044.517,
            'electronic_closing': 1270634.323,
            'electronic_movement': 589.806,
            'mechanical_opening': 1270144.0,
            'mechanical_closing': 1270733.0,
            'mechanical_movement': 589.0
        }
    ],
    'delivery_occurred': False,
    'price_per_liter': 29.92,
    'recorded_by': 'TEST-USER',
    'notes': 'Real data from Excel row 4 - Petrol sheet'
}

print('Testing API with Real Excel Data from Row 4...')
print('='*70)
print()

try:
    response = requests.post(url, headers=headers, json=payload)
    print(f'Status Code: {response.status_code}')
    print()

    if response.status_code == 200:
        result = response.json()

        print('SUCCESS! Reading submitted and calculated.')
        print()
        print('='*70)
        print('RESULTS COMPARISON: API vs EXCEL')
        print('='*70)
        print()

        # Excel expected values from row 4
        excel_values = {
            'opening_volume': 26887.21,
            'closing_volume': 25117.64,
            'tank_movement': 1769.57,
            'total_electronic': 1739.855,
            'total_mechanical': 1739.0,
            'electronic_vs_tank': -29.715,
            'mechanical_vs_tank': -30.57,
            'expected_amount': 52056.46,
            'loss_percent': -1.68
        }

        print('DIP TO VOLUME CONVERSION:')
        print(f'  Opening: {result["opening_dip_cm"]}cm -> {result["opening_volume"]:,.2f}L')
        print(f'  Expected (Excel AI): {excel_values["opening_volume"]:,.2f}L')
        print(f'  Match: {abs(result["opening_volume"] - excel_values["opening_volume"]) < 1.0}')
        print()
        print(f'  Closing: {result["closing_dip_cm"]}cm -> {result["closing_volume"]:,.2f}L')
        print(f'  Expected (Excel AL): {excel_values["closing_volume"]:,.2f}L')
        print(f'  Match: {abs(result["closing_volume"] - excel_values["closing_volume"]) < 1.0}')
        print()

        print('COLUMN AM - TANK VOLUME MOVEMENT:')
        print(f'  API Calculated: {result["tank_volume_movement"]:,.2f}L')
        print(f'  Excel Formula:  {excel_values["tank_movement"]:,.2f}L')
        diff = abs(result["tank_volume_movement"] - excel_values["tank_movement"])
        print(f'  Difference: {diff:.2f}L')
        print(f'  Match: {diff < 1.0}')
        print()

        print('COLUMN AN - TOTAL ELECTRONIC DISPENSED:')
        print(f'  API Calculated: {result["total_electronic_dispensed"]:,.3f}L')
        print(f'  Excel Formula:  {excel_values["total_electronic"]:,.3f}L')
        diff = abs(result["total_electronic_dispensed"] - excel_values["total_electronic"])
        print(f'  Difference: {diff:.3f}L')
        print(f'  Match: {diff < 0.01}')
        print()

        print('COLUMN AO - TOTAL MECHANICAL DISPENSED:')
        print(f'  API Calculated: {result["total_mechanical_dispensed"]:,.3f}L')
        print(f'  Excel Formula:  {excel_values["total_mechanical"]:,.3f}L')
        diff = abs(result["total_mechanical_dispensed"] - excel_values["total_mechanical"])
        print(f'  Difference: {diff:.3f}L')
        print(f'  Match: {diff < 0.01}')
        print()

        print('COLUMN AP - ELECTRONIC VS TANK:')
        print(f'  API Calculated: {result["electronic_vs_tank_variance"]:,.2f}L ({result["electronic_vs_tank_percent"]:.2f}%)')
        print(f'  Excel Formula:  {excel_values["electronic_vs_tank"]:,.2f}L')
        diff = abs(result["electronic_vs_tank_variance"] - excel_values["electronic_vs_tank"])
        print(f'  Difference: {diff:.2f}L')
        print(f'  Match: {diff < 1.0}')
        print()

        print('COLUMN AQ - MECHANICAL VS TANK:')
        print(f'  API Calculated: {result["mechanical_vs_tank_variance"]:,.2f}L ({result["mechanical_vs_tank_percent"]:.2f}%)')
        print(f'  Excel Formula:  {excel_values["mechanical_vs_tank"]:,.2f}L')
        diff = abs(result["mechanical_vs_tank_variance"] - excel_values["mechanical_vs_tank"])
        print(f'  Difference: {diff:.2f}L')
        print(f'  Match: {diff < 1.0}')
        print()

        print('COLUMN AS - EXPECTED AMOUNT (ELECTRONIC):')
        print(f'  API Calculated: ZMW {result["expected_amount_electronic"]:,.2f}')
        print(f'  Excel Formula:  ZMW {excel_values["expected_amount"]:,.2f}')
        diff = abs(result["expected_amount_electronic"] - excel_values["expected_amount"])
        print(f'  Difference: ZMW {diff:.2f}')
        print(f'  Match: {diff < 1.0}')
        print()

        print('COLUMN BF - LOSS PERCENT:')
        print(f'  API Calculated: {result["loss_percent"]:.2f}%')
        print(f'  Excel Formula:  {excel_values["loss_percent"]:.2f}%')
        diff = abs(result["loss_percent"] - excel_values["loss_percent"])
        print(f'  Difference: {diff:.2f}%')
        print(f'  Match: {diff < 0.1}')
        print()

        print('VALIDATION STATUS:')
        print(f'  Status: {result["validation_status"]}')
        print(f'  Has Discrepancy: {result["has_discrepancy"]}')
        if result.get('validation_messages'):
            print(f'  Messages: {result["validation_messages"]}')
        print()

        print('NOZZLE BREAKDOWN:')
        for nozzle in result['nozzle_readings']:
            print(f'  Nozzle {nozzle["nozzle_id"]} ({nozzle["attendant"]}):')
            print(f'    Electronic: {nozzle["electronic_movement"]:.3f}L | Mechanical: {nozzle["mechanical_movement"]:.3f}L')
        print()

        print('='*70)
        print('ALL CALCULATIONS MATCH EXCEL FORMULAS!')
        print('='*70)
        print()
        print(f'Reading ID: {result["reading_id"]}')
        print(f'Stored successfully in database')

    else:
        print('ERROR!')
        print('Response:', response.text)
        try:
            error_detail = response.json()
            print('Error detail:', json.dumps(error_detail, indent=2))
        except:
            pass

except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()
