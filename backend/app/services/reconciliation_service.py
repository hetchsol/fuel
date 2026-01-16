"""
Three-Way Reconciliation Service

Reconciles three independent sources of truth:
1. Physical: Tank movement (dip readings)
2. Operational: Nozzle sales (electronic/mechanical)
3. Financial: Cash collected (actual banking)

Each source records independently. This service identifies discrepancies
and performs root cause analysis to determine which source is the outlier.
"""

from typing import Dict, List, Optional, Tuple
from enum import Enum


class ReconciliationStatus(str, Enum):
    """Status of three-way reconciliation."""
    BALANCED = "BALANCED"  # All three sources match within tolerance
    VARIANCE_MINOR = "VARIANCE_MINOR"  # Small discrepancies within acceptable range
    VARIANCE_INVESTIGATION = "VARIANCE_INVESTIGATION"  # Requires investigation
    DISCREPANCY_CRITICAL = "DISCREPANCY_CRITICAL"  # Critical mismatch
    INCOMPLETE_DATA = "INCOMPLETE_DATA"  # Missing data from one or more sources


class VarianceType(str, Enum):
    """Type of variance detected."""
    TANK_VS_NOZZLE = "TANK_VS_NOZZLE"  # Physical vs Operational
    TANK_VS_CASH = "TANK_VS_CASH"  # Physical vs Financial
    NOZZLE_VS_CASH = "NOZZLE_VS_CASH"  # Operational vs Financial
    THREE_WAY_MISMATCH = "THREE_WAY_MISMATCH"  # All three differ


class ReconciliationConfig:
    """Configuration for reconciliation tolerances."""

    # Volume tolerances (liters)
    VOLUME_TOLERANCE_MINOR = 50.0  # Up to 50L variance is minor
    VOLUME_TOLERANCE_INVESTIGATION = 200.0  # 50-200L requires investigation
    # Above 200L is critical

    # Percentage tolerances
    PERCENT_TOLERANCE_MINOR = 0.5  # 0.5% variance is acceptable
    PERCENT_TOLERANCE_INVESTIGATION = 2.0  # 0.5-2% requires investigation
    # Above 2% is critical

    # Cash tolerances (monetary units)
    CASH_TOLERANCE_MINOR = 500.0  # Up to 500 cash units is minor
    CASH_TOLERANCE_INVESTIGATION = 2000.0  # 500-2000 requires investigation
    # Above 2000 is critical

    # Minimum volumes for percentage calculations
    MIN_VOLUME_FOR_PERCENT = 100.0  # Don't calculate % for very small volumes


def calculate_three_way_reconciliation(
    tank_movement: float,
    nozzle_sales: float,
    actual_cash: Optional[float],
    price_per_liter: float,
    config: ReconciliationConfig = None
) -> Dict:
    """
    Perform three-way reconciliation between tank, nozzle, and cash.

    Args:
        tank_movement: Volume from tank dip readings (L)
        nozzle_sales: Volume from nozzle readings (L)
        actual_cash: Actual cash collected (can be None if not yet banked)
        price_per_liter: Price per liter for the fuel type
        config: Configuration for tolerance thresholds

    Returns:
        Comprehensive reconciliation report with:
        - status: Overall reconciliation status
        - variances: Detailed variance breakdown
        - root_cause_analysis: Identification of outlier source
        - recommendations: Actions to take
        - tolerance_levels: Which tolerance level was breached
    """
    if config is None:
        config = ReconciliationConfig()

    # Calculate expected values
    expected_cash_from_tank = tank_movement * price_per_liter
    expected_cash_from_nozzle = nozzle_sales * price_per_liter

    # Initialize result structure
    result = {
        'sources': {
            'physical': {
                'tank_movement_liters': tank_movement,
                'expected_cash': expected_cash_from_tank
            },
            'operational': {
                'nozzle_sales_liters': nozzle_sales,
                'expected_cash': expected_cash_from_nozzle
            },
            'financial': {
                'actual_cash': actual_cash,
                'equivalent_liters': actual_cash / price_per_liter if actual_cash else None
            }
        },
        'variances': {},
        'status': ReconciliationStatus.INCOMPLETE_DATA,
        'root_cause_analysis': {},
        'recommendations': [],
        'tolerance_levels': {}
    }

    # Check for incomplete data
    if tank_movement is None or nozzle_sales is None:
        result['recommendations'].append("Missing essential data: tank movement or nozzle sales required")
        return result

    # Variance 1: Tank vs Nozzle (Physical vs Operational)
    tank_nozzle_variance_liters = tank_movement - nozzle_sales
    tank_nozzle_variance_cash = expected_cash_from_tank - expected_cash_from_nozzle
    tank_nozzle_percent = (abs(tank_nozzle_variance_liters) / tank_movement * 100) if tank_movement > config.MIN_VOLUME_FOR_PERCENT else 0

    result['variances']['tank_vs_nozzle'] = {
        'variance_liters': tank_nozzle_variance_liters,
        'variance_cash': tank_nozzle_variance_cash,
        'variance_percent': tank_nozzle_percent,
        'status': _classify_volume_variance(abs(tank_nozzle_variance_liters), tank_nozzle_percent, config)
    }

    # Variance 2: Tank vs Cash (Physical vs Financial)
    if actual_cash is not None:
        tank_cash_variance = expected_cash_from_tank - actual_cash
        tank_cash_variance_liters = tank_cash_variance / price_per_liter
        tank_cash_percent = (abs(tank_cash_variance_liters) / tank_movement * 100) if tank_movement > config.MIN_VOLUME_FOR_PERCENT else 0

        result['variances']['tank_vs_cash'] = {
            'variance_cash': tank_cash_variance,
            'variance_liters': tank_cash_variance_liters,
            'variance_percent': tank_cash_percent,
            'status': _classify_cash_variance(abs(tank_cash_variance), tank_cash_percent, config)
        }

    # Variance 3: Nozzle vs Cash (Operational vs Financial)
    if actual_cash is not None:
        nozzle_cash_variance = expected_cash_from_nozzle - actual_cash
        nozzle_cash_variance_liters = nozzle_cash_variance / price_per_liter
        nozzle_cash_percent = (abs(nozzle_cash_variance_liters) / nozzle_sales * 100) if nozzle_sales > config.MIN_VOLUME_FOR_PERCENT else 0

        result['variances']['nozzle_vs_cash'] = {
            'variance_cash': nozzle_cash_variance,
            'variance_liters': nozzle_cash_variance_liters,
            'variance_percent': nozzle_cash_percent,
            'status': _classify_cash_variance(abs(nozzle_cash_variance), nozzle_cash_percent, config)
        }

    # Determine overall status
    result['status'] = _determine_overall_status(result['variances'], actual_cash)

    # Root cause analysis
    result['root_cause_analysis'] = _perform_root_cause_analysis(
        tank_movement=tank_movement,
        nozzle_sales=nozzle_sales,
        actual_cash=actual_cash,
        variances=result['variances'],
        config=config
    )

    # Generate recommendations
    result['recommendations'] = _generate_recommendations(
        status=result['status'],
        variances=result['variances'],
        root_cause=result['root_cause_analysis']
    )

    return result


def _classify_volume_variance(abs_variance_liters: float, variance_percent: float, config: ReconciliationConfig) -> str:
    """Classify volume variance into tolerance levels."""
    if abs_variance_liters <= config.VOLUME_TOLERANCE_MINOR and variance_percent <= config.PERCENT_TOLERANCE_MINOR:
        return "WITHIN_TOLERANCE"
    elif abs_variance_liters <= config.VOLUME_TOLERANCE_INVESTIGATION and variance_percent <= config.PERCENT_TOLERANCE_INVESTIGATION:
        return "REQUIRES_INVESTIGATION"
    else:
        return "CRITICAL"


def _classify_cash_variance(abs_variance_cash: float, variance_percent: float, config: ReconciliationConfig) -> str:
    """Classify cash variance into tolerance levels."""
    if abs_variance_cash <= config.CASH_TOLERANCE_MINOR and variance_percent <= config.PERCENT_TOLERANCE_MINOR:
        return "WITHIN_TOLERANCE"
    elif abs_variance_cash <= config.CASH_TOLERANCE_INVESTIGATION and variance_percent <= config.PERCENT_TOLERANCE_INVESTIGATION:
        return "REQUIRES_INVESTIGATION"
    else:
        return "CRITICAL"


def _determine_overall_status(variances: Dict, actual_cash: Optional[float]) -> ReconciliationStatus:
    """Determine overall reconciliation status from all variances."""
    if actual_cash is None:
        # Can only check tank vs nozzle if cash not provided
        tank_nozzle_status = variances['tank_vs_nozzle']['status']
        if tank_nozzle_status == "WITHIN_TOLERANCE":
            return ReconciliationStatus.BALANCED
        elif tank_nozzle_status == "REQUIRES_INVESTIGATION":
            return ReconciliationStatus.VARIANCE_INVESTIGATION
        else:
            return ReconciliationStatus.DISCREPANCY_CRITICAL

    # All three sources available
    statuses = [v['status'] for v in variances.values()]

    if all(s == "WITHIN_TOLERANCE" for s in statuses):
        return ReconciliationStatus.BALANCED
    elif any(s == "CRITICAL" for s in statuses):
        return ReconciliationStatus.DISCREPANCY_CRITICAL
    elif any(s == "REQUIRES_INVESTIGATION" for s in statuses):
        return ReconciliationStatus.VARIANCE_INVESTIGATION
    else:
        return ReconciliationStatus.VARIANCE_MINOR


def _perform_root_cause_analysis(
    tank_movement: float,
    nozzle_sales: float,
    actual_cash: Optional[float],
    variances: Dict,
    config: ReconciliationConfig
) -> Dict:
    """
    Identify which source is the outlier when discrepancies occur.

    Logic:
    - If tank and nozzle match but cash differs → Cash issue (theft, recording error)
    - If tank and cash match but nozzle differs → Nozzle issue (calibration, reading error)
    - If nozzle and cash match but tank differs → Tank issue (leak, dip reading error)
    - If all three differ → Systematic issue or multiple errors
    """
    analysis = {
        'outlier_source': None,
        'confidence': None,
        'likely_causes': []
    }

    tank_nozzle_ok = variances['tank_vs_nozzle']['status'] == "WITHIN_TOLERANCE"

    if actual_cash is None:
        if not tank_nozzle_ok:
            analysis['outlier_source'] = "UNKNOWN"
            analysis['confidence'] = "LOW"
            analysis['likely_causes'] = [
                "Need cash data to determine if issue is with tank or nozzle",
                "Could be tank leak, nozzle calibration, or dip reading error"
            ]
        return analysis

    tank_cash_ok = variances['tank_vs_cash']['status'] == "WITHIN_TOLERANCE"
    nozzle_cash_ok = variances['nozzle_vs_cash']['status'] == "WITHIN_TOLERANCE"

    # Pattern 1: Tank & Nozzle match, Cash differs
    if tank_nozzle_ok and not tank_cash_ok and not nozzle_cash_ok:
        analysis['outlier_source'] = "FINANCIAL"
        analysis['confidence'] = "HIGH"
        if variances['nozzle_vs_cash']['variance_cash'] > 0:
            # Cash is less than expected
            analysis['likely_causes'] = [
                "Theft or cash shortage",
                "Credit/account sales not recorded in cash",
                "Cash not fully deposited/counted",
                "Pricing error (charged less than recorded price)"
            ]
        else:
            # Cash is more than expected
            analysis['likely_causes'] = [
                "Cash from other source (non-fuel sales)",
                "Pricing error (charged more than recorded price)",
                "Previous shift cash mixed in",
                "Accounting error in cash recording"
            ]

    # Pattern 2: Tank & Cash match, Nozzle differs
    elif tank_cash_ok and not tank_nozzle_ok and not nozzle_cash_ok:
        analysis['outlier_source'] = "OPERATIONAL"
        analysis['confidence'] = "HIGH"
        if variances['tank_vs_nozzle']['variance_liters'] > 0:
            # Tank shows more than nozzles
            analysis['likely_causes'] = [
                "Nozzle reading error (under-reporting)",
                "Nozzle not calibrated correctly",
                "Nozzle meter malfunction",
                "Manual dispensing not recorded through nozzles",
                "Nozzle readings not submitted by attendant"
            ]
        else:
            # Nozzles show more than tank
            analysis['likely_causes'] = [
                "Nozzle reading error (over-reporting)",
                "Nozzle calibration issue (reading high)",
                "Air in lines inflating nozzle readings",
                "Duplicate nozzle reading submission"
            ]

    # Pattern 3: Nozzle & Cash match, Tank differs
    elif nozzle_cash_ok and not tank_nozzle_ok and not tank_cash_ok:
        analysis['outlier_source'] = "PHYSICAL"
        analysis['confidence'] = "HIGH"
        if variances['tank_vs_nozzle']['variance_liters'] > 0:
            # Tank shows more than nozzles/cash
            analysis['likely_causes'] = [
                "Closing dip reading error (read too high)",
                "Tank gauge/stick calibration issue",
                "Delivery not properly recorded",
                "Temperature expansion affecting dip reading"
            ]
        else:
            # Tank shows less than nozzles/cash
            analysis['likely_causes'] = [
                "Tank leak or evaporation",
                "Opening dip reading error (read too high)",
                "Unrecorded outflow (theft from tank)",
                "Delivery recorded but not received",
                "Tank gauge/stick calibration issue"
            ]

    # Pattern 4: All three differ
    elif not tank_nozzle_ok and not tank_cash_ok and not nozzle_cash_ok:
        analysis['outlier_source'] = "MULTIPLE"
        analysis['confidence'] = "LOW"
        analysis['likely_causes'] = [
            "Multiple systematic errors across all measurement points",
            "Major operational issue requiring full audit",
            "Possible fraud or tampering with multiple records",
            "Delivery and sales occurred but not all properly recorded",
            "Price changes during shift not consistently applied"
        ]

    # Pattern 5: All three match (shouldn't reach here if called from variance detection)
    else:
        analysis['outlier_source'] = None
        analysis['confidence'] = "HIGH"
        analysis['likely_causes'] = ["All sources reconcile within tolerance"]

    return analysis


def _generate_recommendations(status: ReconciliationStatus, variances: Dict, root_cause: Dict) -> List[str]:
    """Generate actionable recommendations based on reconciliation results."""
    recommendations = []

    if status == ReconciliationStatus.BALANCED:
        recommendations.append("✓ All sources reconcile within acceptable tolerance")
        recommendations.append("No action required")
        return recommendations

    if status == ReconciliationStatus.VARIANCE_MINOR:
        recommendations.append("Minor variances detected but within acceptable range")
        recommendations.append("Monitor for patterns over multiple shifts")
        recommendations.append("Consider investigating if variance repeats consistently")

    if status == ReconciliationStatus.VARIANCE_INVESTIGATION:
        recommendations.append("⚠ Variance requires investigation")

    if status == ReconciliationStatus.DISCREPANCY_CRITICAL:
        recommendations.append("🚨 CRITICAL discrepancy detected - immediate action required")

    # Source-specific recommendations
    outlier = root_cause.get('outlier_source')

    if outlier == "PHYSICAL":
        recommendations.extend([
            "Action: Verify tank dip readings (re-measure if possible)",
            "Action: Check tank gauge/stick calibration",
            "Action: Inspect tank for leaks or unauthorized access",
            "Action: Review delivery records for completeness"
        ])

    elif outlier == "OPERATIONAL":
        recommendations.extend([
            "Action: Verify all nozzle readings were submitted",
            "Action: Check nozzle calibration certificates",
            "Action: Test nozzle meters for accuracy",
            "Action: Review if any manual dispensing occurred"
        ])

    elif outlier == "FINANCIAL":
        recommendations.extend([
            "Action: Recount cash and verify banking",
            "Action: Review credit/account sales documentation",
            "Action: Check if pricing was consistent throughout shift",
            "Action: Investigate potential theft or cash shortage"
        ])

    elif outlier == "MULTIPLE":
        recommendations.extend([
            "Action: Conduct comprehensive audit of entire shift",
            "Action: Re-verify all three sources independently",
            "Action: Review with supervisor before closing shift",
            "Action: Check for systematic issues affecting multiple measurements"
        ])

    # Add specific variance-based recommendations
    for variance_name, variance_data in variances.items():
        if variance_data['status'] == "CRITICAL":
            variance_pct = variance_data.get('variance_percent', 0)
            recommendations.append(
                f"Critical: {variance_name.replace('_', ' ').title()} variance is {variance_pct:.1f}%"
            )

    return recommendations


def get_reconciliation_summary_for_shift(reading_data: Dict) -> Dict:
    """
    Convenience function to get reconciliation summary from a tank reading.

    Args:
        reading_data: Complete tank reading data with tank movement, nozzles, and cash

    Returns:
        Three-way reconciliation report
    """
    tank_movement = reading_data.get('tank_volume_movement', 0)

    # Use electronic dispensed as primary nozzle source
    nozzle_sales = reading_data.get('total_electronic_dispensed', 0)

    # Fallback to mechanical if electronic is 0
    if nozzle_sales == 0:
        nozzle_sales = reading_data.get('total_mechanical_dispensed', 0)

    actual_cash = reading_data.get('actual_cash_banked')
    price_per_liter = reading_data.get('price_per_liter', 0)

    return calculate_three_way_reconciliation(
        tank_movement=tank_movement,
        nozzle_sales=nozzle_sales,
        actual_cash=actual_cash,
        price_per_liter=price_per_liter
    )


def get_historical_variance_pattern(readings: List[Dict]) -> Dict:
    """
    Analyze variance patterns across multiple shifts to identify systematic issues.

    Args:
        readings: List of tank reading data for multiple shifts

    Returns:
        Pattern analysis showing trends and recurring issues
    """
    pattern_analysis = {
        'total_shifts': len(readings),
        'balanced_shifts': 0,
        'variance_shifts': 0,
        'critical_shifts': 0,
        'recurring_outliers': {
            'PHYSICAL': 0,
            'OPERATIONAL': 0,
            'FINANCIAL': 0,
            'MULTIPLE': 0
        },
        'average_variances': {
            'tank_vs_nozzle_liters': 0,
            'tank_vs_cash': 0,
            'nozzle_vs_cash': 0
        },
        'trend': None,
        'recommendations': []
    }

    if not readings:
        return pattern_analysis

    total_tank_nozzle_variance = 0
    total_tank_cash_variance = 0
    total_nozzle_cash_variance = 0

    for reading in readings:
        reconciliation = get_reconciliation_summary_for_shift(reading)

        # Count by status
        if reconciliation['status'] == ReconciliationStatus.BALANCED:
            pattern_analysis['balanced_shifts'] += 1
        elif reconciliation['status'] in [ReconciliationStatus.VARIANCE_MINOR, ReconciliationStatus.VARIANCE_INVESTIGATION]:
            pattern_analysis['variance_shifts'] += 1
        else:
            pattern_analysis['critical_shifts'] += 1

        # Track recurring outliers
        outlier = reconciliation['root_cause_analysis'].get('outlier_source')
        if outlier in pattern_analysis['recurring_outliers']:
            pattern_analysis['recurring_outliers'][outlier] += 1

        # Accumulate variances
        variances = reconciliation['variances']
        total_tank_nozzle_variance += abs(variances['tank_vs_nozzle']['variance_liters'])
        if 'tank_vs_cash' in variances:
            total_tank_cash_variance += abs(variances['tank_vs_cash']['variance_cash'])
        if 'nozzle_vs_cash' in variances:
            total_nozzle_cash_variance += abs(variances['nozzle_vs_cash']['variance_cash'])

    # Calculate averages
    pattern_analysis['average_variances']['tank_vs_nozzle_liters'] = total_tank_nozzle_variance / len(readings)
    pattern_analysis['average_variances']['tank_vs_cash'] = total_tank_cash_variance / len(readings) if len(readings) > 0 else 0
    pattern_analysis['average_variances']['nozzle_vs_cash'] = total_nozzle_cash_variance / len(readings) if len(readings) > 0 else 0

    # Determine trend
    if pattern_analysis['balanced_shifts'] > len(readings) * 0.8:
        pattern_analysis['trend'] = "EXCELLENT"
        pattern_analysis['recommendations'].append("Reconciliation performance is excellent")
    elif pattern_analysis['balanced_shifts'] > len(readings) * 0.6:
        pattern_analysis['trend'] = "GOOD"
        pattern_analysis['recommendations'].append("Good reconciliation performance with minor variances")
    elif pattern_analysis['critical_shifts'] < len(readings) * 0.1:
        pattern_analysis['trend'] = "ACCEPTABLE"
        pattern_analysis['recommendations'].append("Acceptable performance but requires attention to recurring variances")
    else:
        pattern_analysis['trend'] = "POOR"
        pattern_analysis['recommendations'].append("Poor reconciliation performance - immediate systematic review required")

    # Identify recurring issues
    max_outlier = max(pattern_analysis['recurring_outliers'], key=pattern_analysis['recurring_outliers'].get)
    if pattern_analysis['recurring_outliers'][max_outlier] > len(readings) * 0.3:
        pattern_analysis['recommendations'].append(
            f"Recurring issue with {max_outlier} source detected in {pattern_analysis['recurring_outliers'][max_outlier]} shifts - systematic fix required"
        )

    return pattern_analysis
