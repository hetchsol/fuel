"""
Test Script for Relationship Validation System
Tests foreign key validation, dependent record checking, and cascade deletes
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database import storage as storage_module
from app.services.validation_engine import (
    validate_foreign_keys,
    check_dependents,
    validate_delete
)
from app.services.relationship_validation import (
    validate_create,
    validate_update,
    validate_delete_operation
)
from fastapi import HTTPException


class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []

    def record(self, test_name: str, passed: bool, message: str = ""):
        self.tests.append({
            'name': test_name,
            'passed': passed,
            'message': message
        })
        if passed:
            self.passed += 1
            print(f"[PASS] {test_name}")
        else:
            self.failed += 1
            print(f"[FAIL] {test_name}")
            if message:
                print(f"   Message: {message}")

    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed} ({self.passed/total*100:.1f}%)")
        print(f"Failed: {self.failed} ({self.failed/total*100:.1f}%)")
        print(f"{'='*60}\n")


def setup_test_data():
    """Setup test data in storage"""
    print("\n" + "="*60)
    print("SETTING UP TEST DATA")
    print("="*60 + "\n")

    # Clear existing data
    storage_module.STORAGE['users'] = {}
    storage_module.STORAGE['shifts'] = {}
    storage_module.STORAGE['accounts'] = {}
    storage_module.STORAGE['lubricants'] = {}
    storage_module.STORAGE['readings'] = []
    storage_module.STORAGE['credit_sales'] = []
    storage_module.STORAGE['lpg_sales'] = []
    storage_module.STORAGE['lubricant_sales'] = []

    # Add test users
    storage_module.STORAGE['users']['USER-001'] = {
        'user_id': 'USER-001',
        'username': 'testuser',
        'full_name': 'Test User',
        'role': 'supervisor'
    }

    # Add test shift
    storage_module.STORAGE['shifts']['SHIFT-001'] = {
        'shift_id': 'SHIFT-001',
        'date': '2024-01-15',
        'shift_type': 'Day',
        'attendants': ['Test User'],
        'status': 'active'
    }

    # Add test account
    storage_module.STORAGE['accounts']['ACC-TEST'] = {
        'account_id': 'ACC-TEST',
        'account_name': 'Test Account',
        'account_type': 'Corporate',
        'credit_limit': 100000.0,
        'current_balance': 0.0
    }

    # Add test lubricant
    storage_module.STORAGE['lubricants']['LUB-TEST'] = {
        'product_code': 'LUB-TEST',
        'description': 'Test Lubricant',
        'category': 'Engine Oil',
        'unit_price': 85.0,
        'location': 'Island 3',
        'opening_stock': 50,
        'current_stock': 50
    }

    print(">> Created test users")
    print(">> Created test shifts")
    print(">> Created test accounts")
    print(">> Created test lubricants")


def test_foreign_key_validation(results: TestResults):
    """Test foreign key validation"""
    print("\n" + "="*60)
    print("TEST 1: FOREIGN KEY VALIDATION")
    print("="*60 + "\n")

    # Test 1.1: Valid foreign key should pass
    try:
        validate_create('credit_sales', {
            'sale_id': 'SALE-001',
            'account_id': 'ACC-TEST',  # Valid account
            'shift_id': 'SHIFT-001',    # Valid shift
            'date': '2024-01-15',
            'fuel_type': 'Diesel',
            'volume': 100.0,
            'amount': 2698.0
        })
        results.record("1.1: Valid foreign keys should pass", True)
    except HTTPException as e:
        results.record("1.1: Valid foreign keys should pass", False, str(e.detail))

    # Test 1.2: Invalid account_id should fail
    try:
        validate_create('credit_sales', {
            'sale_id': 'SALE-002',
            'account_id': 'ACC-INVALID',  # Invalid account
            'shift_id': 'SHIFT-001',
            'date': '2024-01-15',
            'fuel_type': 'Diesel',
            'volume': 100.0,
            'amount': 2698.0
        })
        results.record("1.2: Invalid account_id should fail", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 400 and 'foreign_key_violation' in str(e.detail):
            results.record("1.2: Invalid account_id should fail", True)
        else:
            results.record("1.2: Invalid account_id should fail", False, f"Wrong error: {e.detail}")

    # Test 1.3: Invalid shift_id should fail
    try:
        validate_create('credit_sales', {
            'sale_id': 'SALE-003',
            'account_id': 'ACC-TEST',
            'shift_id': 'SHIFT-INVALID',  # Invalid shift
            'date': '2024-01-15',
            'fuel_type': 'Diesel',
            'volume': 100.0,
            'amount': 2698.0
        })
        results.record("1.3: Invalid shift_id should fail", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 400 and 'foreign_key_violation' in str(e.detail):
            results.record("1.3: Invalid shift_id should fail", True)
        else:
            results.record("1.3: Invalid shift_id should fail", False, f"Wrong error: {e.detail}")

    # Test 1.4: LPG sale with invalid shift_id should fail
    try:
        validate_create('lpg_sales', {
            'sale_id': 'LPG-001',
            'shift_id': 'SHIFT-INVALID',  # Invalid shift
            'cylinder_size': '13kg',
            'quantity_kg': 13.0,
            'price_per_kg': 25.0,
            'total_amount': 325.0,
            'sale_type': 'Refill'
        })
        results.record("1.4: LPG sale with invalid shift_id should fail", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 400:
            results.record("1.4: LPG sale with invalid shift_id should fail", True)
        else:
            results.record("1.4: LPG sale with invalid shift_id should fail", False, f"Wrong error: {e.detail}")

    # Test 1.5: Lubricant sale with invalid product_code should fail
    try:
        validate_create('lubricant_sales', {
            'sale_id': 'LSALE-001',
            'shift_id': 'SHIFT-001',
            'product_code': 'LUB-INVALID',  # Invalid lubricant
            'quantity': 2,
            'unit_price': 85.0,
            'total_amount': 170.0
        })
        results.record("1.5: Lubricant sale with invalid product_code should fail", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 400:
            results.record("1.5: Lubricant sale with invalid product_code should fail", True)
        else:
            results.record("1.5: Lubricant sale with invalid product_code should fail", False, f"Wrong error: {e.detail}")


def test_dependent_records(results: TestResults):
    """Test dependent record checking"""
    print("\n" + "="*60)
    print("TEST 2: DEPENDENT RECORD CHECKING")
    print("="*60 + "\n")

    # Add some dependent records
    storage_module.STORAGE['credit_sales'].append({
        'sale_id': 'SALE-001',
        'account_id': 'ACC-TEST',
        'shift_id': 'SHIFT-001',
        'date': '2024-01-15',
        'fuel_type': 'Diesel',
        'volume': 100.0,
        'amount': 2698.0
    })

    storage_module.STORAGE['lpg_sales'].append({
        'sale_id': 'LPG-001',
        'shift_id': 'SHIFT-001',
        'cylinder_size': '13kg',
        'quantity_kg': 13.0,
        'price_per_kg': 25.0,
        'total_amount': 325.0,
        'sale_type': 'Refill'
    })

    # Test 2.1: Check dependents returns correct count
    dependents = check_dependents('shifts', 'SHIFT-001')
    if len(dependents) == 2:  # Should have credit_sales and lpg_sales
        results.record("2.1: Check dependents returns correct count", True)
    else:
        results.record("2.1: Check dependents returns correct count", False, f"Expected 2 dependents, got {len(dependents)}")

    # Test 2.2: Cannot delete shift with dependents
    try:
        validate_delete_operation('shifts', 'SHIFT-001', cascade=False)
        results.record("2.2: Cannot delete shift with dependents", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 409 and 'dependent_records_exist' in str(e.detail):
            results.record("2.2: Cannot delete shift with dependents", True)
        else:
            results.record("2.2: Cannot delete shift with dependents", False, f"Wrong error: {e.detail}")

    # Test 2.3: Cannot delete account with credit sales
    try:
        validate_delete_operation('accounts', 'ACC-TEST', cascade=False)
        results.record("2.3: Cannot delete account with credit sales", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 409:
            results.record("2.3: Cannot delete account with credit sales", True)
        else:
            results.record("2.3: Cannot delete account with credit sales", False, f"Wrong error: {e.detail}")


def test_cascade_delete(results: TestResults):
    """Test cascade delete functionality"""
    print("\n" + "="*60)
    print("TEST 3: CASCADE DELETE")
    print("="*60 + "\n")

    # Create a new shift with dependents for cascade testing
    storage_module.STORAGE['shifts']['SHIFT-CASCADE'] = {
        'shift_id': 'SHIFT-CASCADE',
        'date': '2024-01-16',
        'shift_type': 'Night',
        'attendants': ['Test User'],
        'status': 'active'
    }

    storage_module.STORAGE['lpg_sales'].append({
        'sale_id': 'LPG-CASCADE',
        'shift_id': 'SHIFT-CASCADE',
        'cylinder_size': '9kg',
        'quantity_kg': 9.0,
        'price_per_kg': 25.0,
        'total_amount': 225.0,
        'sale_type': 'Refill'
    })

    # Count initial LPG sales
    initial_lpg_count = len(storage_module.STORAGE['lpg_sales'])

    # Test 3.1: Cascade delete should work
    try:
        validate_delete('shifts', 'SHIFT-CASCADE', cascade=True)
        # Check if dependent was removed
        remaining_lpg = [s for s in storage_module.STORAGE['lpg_sales'] if s['shift_id'] == 'SHIFT-CASCADE']
        if len(remaining_lpg) == 0:
            results.record("3.1: Cascade delete removes dependents", True)
        else:
            results.record("3.1: Cascade delete removes dependents", False, f"Dependent still exists")
    except HTTPException as e:
        results.record("3.1: Cascade delete removes dependents", False, f"Unexpected error: {e.detail}")

    # Test 3.2: Can delete entity after cascade removes dependents
    try:
        # After cascade, shift should be deletable
        del storage_module.STORAGE['shifts']['SHIFT-CASCADE']
        results.record("3.2: Can delete entity after cascade", True)
    except Exception as e:
        results.record("3.2: Can delete entity after cascade", False, str(e))


def test_valid_operations(results: TestResults):
    """Test that valid operations still work"""
    print("\n" + "="*60)
    print("TEST 4: VALID OPERATIONS STILL WORK")
    print("="*60 + "\n")

    # Test 4.1: Can create valid credit sale
    try:
        validate_create('credit_sales', {
            'sale_id': 'SALE-VALID',
            'account_id': 'ACC-TEST',
            'shift_id': 'SHIFT-001',
            'date': '2024-01-15',
            'fuel_type': 'Petrol',
            'volume': 50.0,
            'amount': 1496.0
        })
        results.record("4.1: Can create valid credit sale", True)
    except HTTPException as e:
        results.record("4.1: Can create valid credit sale", False, f"Should not fail: {e.detail}")

    # Test 4.2: Can create valid LPG sale
    try:
        validate_create('lpg_sales', {
            'sale_id': 'LPG-VALID',
            'shift_id': 'SHIFT-001',
            'cylinder_size': '6kg',
            'quantity_kg': 6.0,
            'price_per_kg': 25.0,
            'total_amount': 150.0,
            'sale_type': 'New'
        })
        results.record("4.2: Can create valid LPG sale", True)
    except HTTPException as e:
        results.record("4.2: Can create valid LPG sale", False, f"Should not fail: {e.detail}")

    # Test 4.3: Can delete entity without dependents
    storage_module.STORAGE['users']['USER-ORPHAN'] = {
        'user_id': 'USER-ORPHAN',
        'username': 'orphan',
        'full_name': 'Orphan User',
        'role': 'user'
    }

    try:
        validate_delete_operation('users', 'USER-ORPHAN', cascade=False)
        del storage_module.STORAGE['users']['USER-ORPHAN']
        results.record("4.3: Can delete entity without dependents", True)
    except HTTPException as e:
        results.record("4.3: Can delete entity without dependents", False, f"Should not fail: {e.detail}")


def test_optional_foreign_keys(results: TestResults):
    """Test optional foreign key handling"""
    print("\n" + "="*60)
    print("TEST 5: OPTIONAL FOREIGN KEYS")
    print("="*60 + "\n")

    # Test 5.1: Shift without supervisor_id should be valid (optional FK)
    try:
        validate_create('shifts', {
            'shift_id': 'SHIFT-NO-SUPERVISOR',
            'date': '2024-01-17',
            'shift_type': 'Day',
            'attendants': ['Test User'],
            'status': 'active'
            # supervisor_id is optional, not provided
        })
        results.record("5.1: Shift without supervisor_id should be valid", True)
    except HTTPException as e:
        results.record("5.1: Shift without supervisor_id should be valid", False, f"Should not fail: {e.detail}")

    # Test 5.2: Shift with valid supervisor_id should be valid
    try:
        validate_create('shifts', {
            'shift_id': 'SHIFT-WITH-SUPERVISOR',
            'date': '2024-01-17',
            'shift_type': 'Night',
            'attendants': ['Test User'],
            'status': 'active',
            'supervisor_id': 'USER-001'  # Valid user
        })
        results.record("5.2: Shift with valid supervisor_id should be valid", True)
    except HTTPException as e:
        results.record("5.2: Shift with valid supervisor_id should be valid", False, f"Should not fail: {e.detail}")

    # Test 5.3: Shift with invalid supervisor_id should fail
    try:
        validate_create('shifts', {
            'shift_id': 'SHIFT-INVALID-SUPERVISOR',
            'date': '2024-01-17',
            'shift_type': 'Day',
            'attendants': ['Test User'],
            'status': 'active',
            'supervisor_id': 'USER-INVALID'  # Invalid user
        })
        results.record("5.3: Shift with invalid supervisor_id should fail", False, "Should have raised HTTPException")
    except HTTPException as e:
        if e.status_code == 400:
            results.record("5.3: Shift with invalid supervisor_id should fail", True)
        else:
            results.record("5.3: Shift with invalid supervisor_id should fail", False, f"Wrong error: {e.detail}")


def run_all_tests():
    """Run all validation tests"""
    print("\n" + "#"*60)
    print("# RELATIONSHIP VALIDATION TEST SUITE")
    print("#"*60)

    results = TestResults()

    # Setup
    setup_test_data()

    # Run test suites
    test_foreign_key_validation(results)
    test_dependent_records(results)
    test_cascade_delete(results)
    test_valid_operations(results)
    test_optional_foreign_keys(results)

    # Summary
    results.summary()

    return results.failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
