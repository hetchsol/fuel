"""
Delivery Timeline Service

Handles complex scenarios with multiple deliveries and sales between deliveries.
Provides timeline analysis, inter-delivery sales calculation, and validation.
"""

from typing import List, Dict, Optional, Tuple
from datetime import datetime, time


def parse_time(time_str: str) -> time:
    """Parse time string in HH:MM format to time object."""
    try:
        return datetime.strptime(time_str, "%H:%M").time()
    except:
        # Fallback for other formats
        try:
            return datetime.strptime(time_str, "%I:%M %p").time()
        except:
            return datetime.strptime(time_str, "%H:%M:%S").time()


def calculate_inter_delivery_sales(
    deliveries: List[Dict],
    opening_volume: float,
    closing_volume: float
) -> Dict:
    """
    Calculate sales between deliveries and build comprehensive timeline.

    Timeline Example:
    06:00 - Opening: 10,000 L
    08:00 - Sales: 2,000 L → Level: 8,000 L
    10:00 - Delivery 1: +15,000 L → Level: 23,000 L
    12:00 - Sales: 3,000 L → Level: 20,000 L
    14:00 - Delivery 2: +10,000 L → Level: 30,000 L
    16:00 - Sales: 2,000 L → Level: 28,000 L
    18:00 - Closing: 28,000 L

    Args:
        deliveries: List of delivery dictionaries with before_volume, after_volume, volume_delivered, delivery_time
        opening_volume: Tank level at shift start
        closing_volume: Tank level at shift end

    Returns:
        Dictionary with timeline, inter-delivery sales, and validation
    """
    if not deliveries or len(deliveries) == 0:
        # No deliveries - simple case
        total_sales = opening_volume - closing_volume
        return {
            'has_deliveries': False,
            'total_sales': total_sales,
            'inter_delivery_sales': [],
            'timeline': [
                {
                    'sequence': 1,
                    'event_type': 'SHIFT_START',
                    'time': 'Opening',
                    'tank_level': opening_volume,
                    'change': 0,
                    'description': f'Shift opening volume: {opening_volume:,.0f} L'
                },
                {
                    'sequence': 2,
                    'event_type': 'SALES',
                    'time': 'During shift',
                    'tank_level': closing_volume,
                    'change': -total_sales,
                    'description': f'Sales during shift: {total_sales:,.0f} L'
                },
                {
                    'sequence': 3,
                    'event_type': 'SHIFT_END',
                    'time': 'Closing',
                    'tank_level': closing_volume,
                    'change': 0,
                    'description': f'Shift closing volume: {closing_volume:,.0f} L'
                }
            ],
            'validation': {
                'is_valid': True,
                'errors': [],
                'warnings': []
            }
        }

    # Sort deliveries chronologically by time
    sorted_deliveries = sorted(deliveries, key=lambda d: parse_time(d.get('delivery_time', '00:00')))

    # Build timeline with sales between deliveries
    timeline = []
    inter_delivery_sales = []
    errors = []
    warnings = []
    sequence = 1

    # 1. Shift Start
    timeline.append({
        'sequence': sequence,
        'event_type': 'SHIFT_START',
        'time': 'Opening',
        'tank_level': opening_volume,
        'change': 0,
        'description': f'Shift opening volume: {opening_volume:,.0f} L'
    })
    sequence += 1

    # Track current level
    current_level = opening_volume

    # 2. Process each delivery and calculate sales before it
    for i, delivery in enumerate(sorted_deliveries):
        delivery_time = delivery.get('delivery_time', 'Unknown')
        before_vol = delivery.get('before_volume', 0)
        after_vol = delivery.get('after_volume', 0)
        volume_delivered = delivery.get('volume_delivered', 0)
        supplier = delivery.get('supplier', 'Unknown')

        # Calculate sales BEFORE this delivery
        sales_before_delivery = current_level - before_vol

        if sales_before_delivery > 0:
            # Sales occurred before this delivery
            timeline.append({
                'sequence': sequence,
                'event_type': 'SALES',
                'time': f'Before {delivery_time}',
                'tank_level': before_vol,
                'change': -sales_before_delivery,
                'description': f'Sales before delivery #{i+1}: {sales_before_delivery:,.0f} L',
                'sales_volume': sales_before_delivery,
                'period': f'After delivery #{i} until delivery #{i+1}' if i > 0 else f'Opening until delivery #1'
            })

            inter_delivery_sales.append({
                'period': f'Opening to Delivery {i+1}' if i == 0 else f'Delivery {i} to Delivery {i+1}',
                'sales_volume': sales_before_delivery,
                'start_level': current_level,
                'end_level': before_vol,
                'start_time': timeline[sequence-2]['time'] if sequence > 1 else 'Opening',
                'end_time': delivery_time
            })

            sequence += 1
        elif sales_before_delivery < 0:
            # Negative sales indicates an issue
            errors.append(f"Invalid: Tank level increased without delivery before {delivery_time}")

        # Validate delivery volumes
        calculated_after = before_vol + volume_delivered
        if abs(calculated_after - after_vol) > 0.1:  # Allow 0.1L rounding
            warnings.append(
                f"Delivery #{i+1}: Calculated after volume ({calculated_after:,.1f} L) "
                f"doesn't match recorded ({after_vol:,.1f} L)"
            )

        # Record the delivery
        timeline.append({
            'sequence': sequence,
            'event_type': 'DELIVERY',
            'time': delivery_time,
            'tank_level': after_vol,
            'change': volume_delivered,
            'description': f'Delivery #{i+1} from {supplier}: +{volume_delivered:,.0f} L',
            'delivery_number': i+1,
            'supplier': supplier,
            'before_volume': before_vol,
            'after_volume': after_vol
        })
        sequence += 1

        # Update current level
        current_level = after_vol

    # 3. Calculate sales AFTER last delivery until closing
    sales_after_last_delivery = current_level - closing_volume

    if sales_after_last_delivery > 0:
        timeline.append({
            'sequence': sequence,
            'event_type': 'SALES',
            'time': f'After last delivery',
            'tank_level': closing_volume,
            'change': -sales_after_last_delivery,
            'description': f'Sales after last delivery: {sales_after_last_delivery:,.0f} L',
            'sales_volume': sales_after_last_delivery,
            'period': f'After delivery #{len(sorted_deliveries)} until closing'
        })

        inter_delivery_sales.append({
            'period': f'Delivery {len(sorted_deliveries)} to Closing',
            'sales_volume': sales_after_last_delivery,
            'start_level': current_level,
            'end_level': closing_volume,
            'start_time': sorted_deliveries[-1].get('delivery_time', 'Unknown'),
            'end_time': 'Closing'
        })

        sequence += 1
    elif sales_after_last_delivery < 0:
        errors.append("Invalid: Tank level increased after last delivery without additional delivery")

    # 4. Shift End
    timeline.append({
        'sequence': sequence,
        'event_type': 'SHIFT_END',
        'time': 'Closing',
        'tank_level': closing_volume,
        'change': 0,
        'description': f'Shift closing volume: {closing_volume:,.0f} L'
    })

    # Calculate totals
    total_delivered = sum(d.get('volume_delivered', 0) for d in sorted_deliveries)
    total_sales = sum(s['sales_volume'] for s in inter_delivery_sales)

    # Verify with formula: (Opening - Closing) + Total Delivered = Total Sales
    formula_sales = (opening_volume - closing_volume) + total_delivered

    if abs(formula_sales - total_sales) > 0.1:  # Allow 0.1L rounding
        warnings.append(
            f"Sales calculation mismatch: Timeline shows {total_sales:,.1f} L "
            f"but formula gives {formula_sales:,.1f} L"
        )

    return {
        'has_deliveries': True,
        'number_of_deliveries': len(sorted_deliveries),
        'total_delivered': total_delivered,
        'total_sales': total_sales,
        'formula_sales': formula_sales,
        'inter_delivery_sales': inter_delivery_sales,
        'timeline': timeline,
        'validation': {
            'is_valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings,
            'sales_match': abs(formula_sales - total_sales) <= 0.1
        },
        'summary': {
            'opening': opening_volume,
            'closing': closing_volume,
            'net_change': closing_volume - opening_volume,
            'deliveries': total_delivered,
            'sales': total_sales,
            'periods_with_sales': len(inter_delivery_sales)
        }
    }


def validate_delivery_sequence(
    deliveries: List[Dict],
    opening_volume: float,
    closing_volume: float
) -> Dict[str, any]:
    """
    Validate that delivery sequence is logically consistent.

    Checks:
    1. Each delivery's before_volume matches previous after_volume (accounting for sales)
    2. Volumes don't exceed tank capacity
    3. No negative sales (tank level increasing without delivery)
    4. Timeline makes chronological sense

    Args:
        deliveries: List of delivery dictionaries
        opening_volume: Shift opening volume
        closing_volume: Shift closing volume

    Returns:
        Validation results with errors and warnings
    """
    if not deliveries or len(deliveries) == 0:
        return {
            'is_valid': True,
            'errors': [],
            'warnings': [],
            'message': 'No deliveries to validate'
        }

    errors = []
    warnings = []

    # Sort by time
    sorted_deliveries = sorted(deliveries, key=lambda d: parse_time(d.get('delivery_time', '00:00')))

    # Check first delivery
    first_delivery = sorted_deliveries[0]
    if first_delivery['before_volume'] > opening_volume:
        errors.append(
            f"First delivery before_volume ({first_delivery['before_volume']:,.0f} L) "
            f"is greater than opening volume ({opening_volume:,.0f} L)"
        )

    # Check each subsequent delivery
    for i in range(len(sorted_deliveries) - 1):
        current = sorted_deliveries[i]
        next_delivery = sorted_deliveries[i + 1]

        # Next delivery's before_volume should be <= current after_volume (sales happened)
        if next_delivery['before_volume'] > current['after_volume']:
            errors.append(
                f"Delivery #{i+2} before_volume ({next_delivery['before_volume']:,.0f} L) "
                f"is greater than delivery #{i+1} after_volume ({current['after_volume']:,.0f} L) "
                f"without any sales"
            )

    # Check last delivery
    last_delivery = sorted_deliveries[-1]
    if closing_volume > last_delivery['after_volume']:
        errors.append(
            f"Closing volume ({closing_volume:,.0f} L) is greater than "
            f"last delivery after_volume ({last_delivery['after_volume']:,.0f} L) "
            f"without any additional delivery"
        )

    # Calculate expected sales
    expected_sales = (opening_volume - closing_volume) + sum(d['volume_delivered'] for d in sorted_deliveries)
    if expected_sales < 0:
        errors.append(f"Negative sales calculated ({expected_sales:,.0f} L) - check volumes")

    return {
        'is_valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'message': 'Delivery sequence is valid' if len(errors) == 0 else 'Validation failed'
    }
