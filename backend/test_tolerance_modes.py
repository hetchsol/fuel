"""
Test script: Reconciliation Tolerance Modes
============================================
Runs the same variance scenarios through all 4 modes and prints a comparison table.

Usage:
    cd backend
    python test_tolerance_modes.py
"""

from app.services.reconciliation_service import (
    ReconciliationConfig,
    _classify_volume_variance,
    calculate_three_way_reconciliation,
)


def make_config(mode, **overrides):
    """Build a ReconciliationConfig from a fake storage dict."""
    settings = {
        "volume_tolerance_mode": mode,
        # Percentage mode defaults
        "percent_tolerance_minor": 0.5,
        "percent_tolerance_investigation": 2.0,
        # Fixed mode defaults
        "volume_tolerance_minor": 5.0,
        "volume_tolerance_investigation": 15.0,
        # Hybrid mode defaults (% + cap)
        "volume_cap_minor": 5.0,
        "volume_cap_investigation": 15.0,
        # Tiered mode defaults
        "volume_tiers": [
            {"up_to_liters": 1000,  "tolerance_minor": 2,  "tolerance_investigation": 5},
            {"up_to_liters": 5000,  "tolerance_minor": 5,  "tolerance_investigation": 15},
            {"up_to_liters": 20000, "tolerance_minor": 8,  "tolerance_investigation": 20},
            {"up_to_liters": 50000, "tolerance_minor": 10, "tolerance_investigation": 30},
        ],
        # Cash (same across all modes)
        "cash_tolerance_minor": 500.0,
        "cash_tolerance_investigation": 2000.0,
        "min_volume_for_percent": 100.0,
    }
    settings.update(overrides)
    return ReconciliationConfig(storage={"reconciliation_tolerance_settings": settings})


# ── Test scenarios ──────────────────────────────────────────

scenarios = [
    # (label, reference_volume, abs_variance_liters)
    ("Large tank, tiny loss",   20000,   2),
    ("Large tank, small loss",  20000,  50),
    ("Large tank, medium loss", 20000, 150),
    ("Large tank, big loss",    20000, 500),
    ("Medium tank, tiny loss",   5000,   2),
    ("Medium tank, small loss",  5000,  10),
    ("Medium tank, medium loss", 5000,  50),
    ("Small volume, tiny loss",   500, 1.5),
    ("Small volume, small loss",  500,   3),
    ("Small volume, medium loss", 500,  10),
    ("Micro volume, tiny loss",   100, 0.3),
    ("Micro volume, small loss",  100,   1),
]

modes = ["percentage", "fixed", "hybrid", "tiered"]


def run_classification_test():
    """Compare _classify_volume_variance across all modes."""
    configs = {m: make_config(m) for m in modes}

    # Column widths
    lw = 30  # label
    vw = 10  # volume/variance
    rw = 22  # result

    # Header
    print("\n" + "=" * 120)
    print("RECONCILIATION TOLERANCE MODE COMPARISON")
    print("=" * 120)
    print(f"\nSettings:")
    print(f"  Percentage mode:  minor=0.5%, investigation=2.0%")
    print(f"  Fixed mode:       minor=5L, investigation=15L")
    print(f"  Hybrid mode:      0.5% capped at minor=5L, investigation=15L")
    print(f"  Tiered mode:      0-1000L: 2/5L | 1000-5000L: 5/15L | 5000-20000L: 8/20L | 20000+: 10/30L")
    print()

    header = (
        f"{'Scenario':<{lw}} {'Volume':>{vw}} {'Loss':>{vw}} "
        f"{'Percentage':<{rw}} {'Fixed':<{rw}} {'Hybrid':<{rw}} {'Tiered':<{rw}}"
    )
    print(header)
    print("-" * len(header))

    for label, ref_vol, abs_var in scenarios:
        pct = (abs_var / ref_vol * 100) if ref_vol > 0 else 0
        results = {}
        for m in modes:
            result = _classify_volume_variance(abs_var, pct, configs[m], reference_volume=ref_vol)
            # Shorten for display
            short = result.replace("WITHIN_TOLERANCE", "PASS").replace("REQUIRES_INVESTIGATION", "INVESTIGATE")
            results[m] = short

        print(
            f"{label:<{lw}} {ref_vol:>{vw},.0f}L {abs_var:>{vw},.1f}L "
            f"{results['percentage']:<{rw}} {results['fixed']:<{rw}} {results['hybrid']:<{rw}} {results['tiered']:<{rw}}"
        )

    print()


def run_three_way_test():
    """Run full three-way reconciliation under each mode with a sample shift."""
    print("=" * 120)
    print("FULL THREE-WAY RECONCILIATION — Sample Shift")
    print("=" * 120)

    tank_movement = 15000.0   # Tank dip says 15,000L moved
    nozzle_sales = 14920.0    # Nozzles recorded 14,920L (80L variance)
    actual_cash = 14920.0 * 28.5  # Cash matches nozzles exactly
    price = 28.5              # ZMW per litre

    print(f"\n  Tank movement:  {tank_movement:,.0f}L")
    print(f"  Nozzle sales:   {nozzle_sales:,.0f}L")
    print(f"  Variance:       {tank_movement - nozzle_sales:,.0f}L ({(tank_movement - nozzle_sales)/tank_movement*100:.2f}%)")
    print(f"  Price:          K{price}/L")
    print()

    for mode in modes:
        config = make_config(mode)
        result = calculate_three_way_reconciliation(
            tank_movement=tank_movement,
            nozzle_sales=nozzle_sales,
            actual_cash=actual_cash,
            price_per_liter=price,
            config=config,
        )
        tn = result["variances"]["tank_vs_nozzle"]
        print(f"  {mode.upper():12s}  ->  Overall: {result['status'].value:<25s}  "
              f"Tank vs Nozzle: {tn['status']:<22s}  "
              f"({tn['variance_liters']:+,.0f}L / {tn['variance_percent']:.2f}%)")

    print()


def run_edge_cases():
    """Test edge cases: zero volume, volume above all tiers, etc."""
    print("=" * 120)
    print("EDGE CASES")
    print("=" * 120)

    cases = [
        ("Zero volume",          0,     1),
        ("Tiny volume (50L)",    50,    0.5),
        ("Above all tiers",      80000, 25),
        ("Exact tier boundary",  5000,  5),
        ("Negative-ish (0.01L)", 10000, 0.01),
    ]

    configs = {m: make_config(m) for m in modes}
    lw, vw, rw = 25, 10, 22

    header = (
        f"{'Case':<{lw}} {'Volume':>{vw}} {'Loss':>{vw}} "
        f"{'Percentage':<{rw}} {'Fixed':<{rw}} {'Hybrid':<{rw}} {'Tiered':<{rw}}"
    )
    print()
    print(header)
    print("-" * len(header))

    for label, ref_vol, abs_var in cases:
        pct = (abs_var / ref_vol * 100) if ref_vol > 0 else 0
        results = {}
        for m in modes:
            result = _classify_volume_variance(abs_var, pct, configs[m], reference_volume=ref_vol)
            short = result.replace("WITHIN_TOLERANCE", "PASS").replace("REQUIRES_INVESTIGATION", "INVESTIGATE")
            results[m] = short

        print(
            f"{label:<{lw}} {ref_vol:>{vw},.0f}L {abs_var:>{vw},.2f}L "
            f"{results['percentage']:<{rw}} {results['fixed']:<{rw}} {results['hybrid']:<{rw}} {results['tiered']:<{rw}}"
        )

    print()


if __name__ == "__main__":
    run_classification_test()
    run_three_way_test()
    run_edge_cases()
    print("Done.\n")
