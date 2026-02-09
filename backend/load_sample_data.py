"""
Sample Data Loader Script
Loads reconciliation and other sample data into the system
Run this script after starting the backend to populate sample data
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

# Sample reconciliation data for December 2025
RECONCILIATION_DATA = [
    {
        "shift_id": "SHIFT-DAY-20251213",
        "date": "2025-12-13",
        "shift_type": "Day",
        "petrol_revenue": 45000.50,
        "diesel_revenue": 38500.75,
        "lpg_revenue": 12000.00,
        "lubricants_revenue": 5500.00,
        "accessories_revenue": 3200.00,
        "total_expected": 104201.25,
        "credit_sales_total": 15000.00,
        "expected_cash": 89201.25,
        "actual_deposited": 89200.00,
        "difference": -1.25,
        "cumulative_difference": -1.25,
        "notes": "Day shift - December 13, 2025"
    },
    {
        "shift_id": "SHIFT-NIGHT-20251213",
        "date": "2025-12-13",
        "shift_type": "Night",
        "petrol_revenue": 28500.00,
        "diesel_revenue": 22300.50,
        "lpg_revenue": 6800.00,
        "lubricants_revenue": 2200.00,
        "accessories_revenue": 1500.00,
        "total_expected": 61300.50,
        "credit_sales_total": 8000.00,
        "expected_cash": 53300.50,
        "actual_deposited": 53500.00,
        "difference": 199.50,
        "cumulative_difference": 198.25,
        "notes": "Night shift - December 13, 2025"
    },
    {
        "shift_id": "SHIFT-DAY-20251214",
        "date": "2025-12-14",
        "shift_type": "Day",
        "petrol_revenue": 48200.00,
        "diesel_revenue": 41000.00,
        "lpg_revenue": 13500.00,
        "lubricants_revenue": 6200.00,
        "accessories_revenue": 3800.00,
        "total_expected": 112700.00,
        "credit_sales_total": 18000.00,
        "expected_cash": 94700.00,
        "actual_deposited": 94700.00,
        "difference": 0.00,
        "cumulative_difference": 198.25,
        "notes": "Perfect match - Day shift December 14"
    },
    {
        "shift_id": "SHIFT-DAY-20251215",
        "date": "2025-12-15",
        "shift_type": "Day",
        "petrol_revenue": 52000.00,
        "diesel_revenue": 43500.00,
        "lpg_revenue": 14000.00,
        "lubricants_revenue": 7000.00,
        "accessories_revenue": 4200.00,
        "total_expected": 120700.00,
        "credit_sales_total": 22000.00,
        "expected_cash": 98700.00,
        "actual_deposited": 99000.00,
        "difference": 300.00,
        "cumulative_difference": 498.25,
        "notes": "Busy Sunday - slight overage"
    },
    {
        "shift_id": "SHIFT-DAY-20251216",
        "date": "2025-12-16",
        "shift_type": "Day",
        "petrol_revenue": 44500.00,
        "diesel_revenue": 39200.00,
        "lpg_revenue": 11500.00,
        "lubricants_revenue": 5800.00,
        "accessories_revenue": 3100.00,
        "total_expected": 104100.00,
        "credit_sales_total": 16500.00,
        "expected_cash": 87600.00,
        "actual_deposited": 87450.00,
        "difference": -150.00,
        "cumulative_difference": 348.25,
        "notes": "Monday - slight shortage"
    },
    {
        "shift_id": "SHIFT-NIGHT-20251216",
        "date": "2025-12-16",
        "shift_type": "Night",
        "petrol_revenue": 26800.00,
        "diesel_revenue": 21500.00,
        "lpg_revenue": 6200.00,
        "lubricants_revenue": 2100.00,
        "accessories_revenue": 1400.00,
        "total_expected": 58000.00,
        "credit_sales_total": 7500.00,
        "expected_cash": 50500.00,
        "actual_deposited": 50500.00,
        "difference": 0.00,
        "cumulative_difference": 348.25,
        "notes": "Night shift - perfect balance"
    },
    {
        "shift_id": "SHIFT-DAY-20251217",
        "date": "2025-12-17",
        "shift_type": "Day",
        "petrol_revenue": 49500.00,
        "diesel_revenue": 42000.00,
        "lpg_revenue": 13200.00,
        "lubricants_revenue": 6500.00,
        "accessories_revenue": 3900.00,
        "total_expected": 115100.00,
        "credit_sales_total": 19000.00,
        "expected_cash": 96100.00,
        "actual_deposited": 96250.00,
        "difference": 150.00,
        "cumulative_difference": 498.25,
        "notes": "Tuesday - good day"
    }
]


def load_reconciliation_data():
    """Load reconciliation data"""
    print("Loading reconciliation data...")
    loaded_count = 0

    for recon in RECONCILIATION_DATA:
        try:
            response = requests.post(
                f"{BASE_URL}/reconciliation/shift",
                json=recon,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code == 200:
                loaded_count += 1
                print(f"[OK] Loaded: {recon['date']} - {recon['shift_type']} shift")
            else:
                print(f"[FAIL] Failed to load {recon['date']}: {response.status_code}")
        except Exception as e:
            print(f"[ERROR] Error loading {recon['date']}: {str(e)}")

    print(f"\nLoaded {loaded_count}/{len(RECONCILIATION_DATA)} reconciliation records")


def check_backend_status():
    """Check if backend is running"""
    try:
        response = requests.get(f"http://localhost:8000/health")
        if response.status_code == 200:
            print("[OK] Backend is running")
            return True
        else:
            print("[FAIL] Backend returned error:", response.status_code)
            return False
    except Exception as e:
        print(f"[ERROR] Cannot connect to backend: {str(e)}")
        print("Make sure the backend is running at http://localhost:8000")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Fuel Management System - Sample Data Loader")
    print("=" * 60)
    print()

    # Check backend
    if not check_backend_status():
        print("\nPlease start the backend first:")
        print("  cd backend")
        print("  python -m uvicorn app.main:app --reload")
        exit(1)

    print()

    # Load data
    load_reconciliation_data()

    print()
    print("=" * 60)
    print("Data loading complete!")
    print("=" * 60)
    print()
    print("You can now:")
    print("  • View reconciliation reports at http://localhost:3000/reconciliation")
    print("  • Select dates from Dec 13-17, 2025")
    print("  • Use the Reports page at http://localhost:3000/reports")
    print()
