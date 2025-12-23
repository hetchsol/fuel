"""
Advanced Reports API
Provides filtered reporting by staff, nozzle, island, pump, product, date range, etc.
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional, List
from ...services.reporting import ReportingService
from ...services.relational_queries import RelationalQueryService
from .auth import require_supervisor_or_owner
from datetime import datetime
import json
import os

router = APIRouter()

# In-memory data stores (these would connect to your actual data sources)
sales_data = []
readings_data = []
shifts_data = []
reconciliations_data = []
nozzles_data = []
islands_data = []
users_data = []
tanks_data = []
accounts_data = []


def get_reporting_service() -> ReportingService:
    """Get instance of reporting service with current data"""
    return ReportingService(
        sales_data=sales_data,
        readings_data=readings_data,
        shifts_data=shifts_data,
        reconciliations_data=reconciliations_data
    )


def get_relational_service() -> RelationalQueryService:
    """Get instance of relational query service with all data stores"""
    return RelationalQueryService({
        'sales': sales_data,
        'readings': readings_data,
        'shifts': shifts_data,
        'reconciliations': reconciliations_data,
        'nozzles': nozzles_data,
        'islands': islands_data,
        'users': users_data,
        'tanks': tanks_data,
        'accounts': accounts_data
    })


@router.get("/staff/list")
def get_all_staff_names(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get list of all staff names from sales and readings data

    Example: /reports/staff/list?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Filter data by date if provided
    data = sales_data + readings_data
    if start_date and end_date:
        data = service.filter_by_date_range(start_date, end_date, data)

    # Extract unique staff names
    staff_names = set()
    for record in data:
        name = record.get('staff_name') or record.get('attendant') or record.get('user')
        if name and name != 'Unknown':
            staff_names.add(name)

    return {
        "staff_names": sorted(list(staff_names)),
        "total_count": len(staff_names)
    }


@router.get("/staff/all")
def get_all_staff_reports(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get reports for all staff members

    Example: /reports/staff/all?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Get all staff names
    staff_list = get_all_staff_names(start_date, end_date)

    # Generate report for each staff member
    reports = []
    for staff_name in staff_list['staff_names']:
        report = service.generate_staff_report(staff_name, start_date, end_date)
        reports.append(report)

    return {
        "total_staff": len(reports),
        "date_range": {
            "start_date": start_date,
            "end_date": end_date
        },
        "staff_reports": reports
    }


@router.get("/staff/{staff_name}")
def get_staff_report(
    staff_name: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get comprehensive report for a specific staff member

    Example: /reports/staff/John%20Doe?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()
    return service.generate_staff_report(staff_name, start_date, end_date)


@router.get("/nozzle/list")
def get_all_nozzle_ids(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get list of all nozzle IDs from readings data

    Example: /reports/nozzle/list?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Filter data by date if provided
    data = readings_data.copy()
    if start_date and end_date:
        data = service.filter_by_date_range(start_date, end_date, data)

    # Extract unique nozzle IDs
    nozzle_ids = set()
    for record in data:
        nozzle_id = record.get('nozzle_id')
        if nozzle_id:
            nozzle_ids.add(nozzle_id)

    return {
        "nozzle_ids": sorted(list(nozzle_ids)),
        "total_count": len(nozzle_ids)
    }


@router.get("/nozzle/all")
def get_all_nozzle_reports(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get reports for all nozzles

    Example: /reports/nozzle/all?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Get all nozzle IDs
    nozzle_list = get_all_nozzle_ids(start_date, end_date)

    # Generate report for each nozzle
    reports = []
    for nozzle_id in nozzle_list['nozzle_ids']:
        report = service.generate_nozzle_report(nozzle_id, start_date, end_date)
        if not report.get('error'):  # Only include if there's data
            reports.append(report)

    return {
        "total_nozzles": len(reports),
        "date_range": {
            "start_date": start_date,
            "end_date": end_date
        },
        "nozzle_reports": reports
    }


@router.get("/nozzle/{nozzle_id}")
def get_nozzle_report(
    nozzle_id: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get comprehensive report for a specific nozzle

    Example: /reports/nozzle/ULP-001?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()
    return service.generate_nozzle_report(nozzle_id, start_date, end_date)


@router.get("/island/list")
def get_all_island_ids(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get list of all island IDs from readings data

    Example: /reports/island/list?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Filter data by date if provided
    data = readings_data.copy()
    if start_date and end_date:
        data = service.filter_by_date_range(start_date, end_date, data)

    # Extract unique island IDs
    island_ids = set()
    for record in data:
        island_id = record.get('island_id')
        if island_id:
            island_ids.add(island_id)
        # Also extract from nozzle_id if it starts with ISLAND
        nozzle_id = record.get('nozzle_id', '')
        if 'ISLAND' in nozzle_id.upper():
            # Extract island part (e.g., "ISLAND-1" from "ISLAND-1-ULP-001")
            parts = nozzle_id.split('-')
            if len(parts) >= 2:
                island_ids.add(f"{parts[0]}-{parts[1]}")

    return {
        "island_ids": sorted(list(island_ids)),
        "total_count": len(island_ids)
    }


@router.get("/island/all")
def get_all_island_reports(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get reports for all islands

    Example: /reports/island/all?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Get all island IDs
    island_list = get_all_island_ids(start_date, end_date)

    # Generate report for each island
    reports = []
    for island_id in island_list['island_ids']:
        report = service.generate_island_report(island_id, start_date, end_date)
        reports.append(report)

    return {
        "total_islands": len(reports),
        "date_range": {
            "start_date": start_date,
            "end_date": end_date
        },
        "island_reports": reports
    }


@router.get("/island/{island_id}")
def get_island_report(
    island_id: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get comprehensive report for a specific island (pump station)

    Example: /reports/island/ISLAND-1?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()
    return service.generate_island_report(island_id, start_date, end_date)


@router.get("/product/list")
def get_all_product_types(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get list of all product types from sales data

    Example: /reports/product/list?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Filter data by date if provided
    data = sales_data.copy()
    if start_date and end_date:
        data = service.filter_by_date_range(start_date, end_date, data)

    # Extract unique product types
    product_types = set()
    for record in data:
        product = record.get('product_type') or record.get('fuel_type')
        if product:
            product_types.add(product)

    # Default product types if no data
    if not product_types:
        product_types = {'Petrol', 'Diesel', 'LPG', 'Lubricants', 'Accessories'}

    return {
        "product_types": sorted(list(product_types)),
        "total_count": len(product_types)
    }


@router.get("/product/all")
def get_all_product_reports(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get reports for all product types

    Example: /reports/product/all?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()

    # Get all product types
    product_list = get_all_product_types(start_date, end_date)

    # Generate report for each product
    reports = []
    for product_type in product_list['product_types']:
        report = service.generate_product_report(product_type, start_date, end_date)
        reports.append(report)

    return {
        "total_products": len(reports),
        "date_range": {
            "start_date": start_date,
            "end_date": end_date
        },
        "product_reports": reports
    }


@router.get("/product/{product_type}")
def get_product_report(
    product_type: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
):
    """
    Get comprehensive report for a specific product type

    Product types: Petrol, Diesel, LPG, Lubricants, Accessories

    Example: /reports/product/Petrol?start_date=2025-12-01&end_date=2025-12-31
    """
    service = get_reporting_service()
    return service.generate_product_report(product_type, start_date, end_date)


@router.get("/custom")
def get_custom_report(
    staff_name: Optional[str] = Query(None, description="Filter by staff name"),
    nozzle_id: Optional[str] = Query(None, description="Filter by nozzle ID"),
    island_id: Optional[str] = Query(None, description="Filter by island ID"),
    product_type: Optional[str] = Query(None, description="Filter by product type"),
    shift_id: Optional[str] = Query(None, description="Filter by shift ID"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: dict = Depends(require_supervisor_or_owner)
):
    """
    Get custom report with multiple filters

    **Access**: Restricted to supervisors and owners only

    Apply any combination of filters to generate a custom report.

    Example: /reports/custom?staff_name=John&product_type=Petrol&start_date=2025-12-01&end_date=2025-12-31
    """
    filters = {}

    if staff_name:
        filters['staff_name'] = staff_name
    if nozzle_id:
        filters['nozzle_id'] = nozzle_id
    if island_id:
        filters['island_id'] = island_id
    if product_type:
        filters['product_type'] = product_type
    if shift_id:
        filters['shift_id'] = shift_id
    if start_date:
        filters['start_date'] = start_date
    if end_date:
        filters['end_date'] = end_date

    service = get_reporting_service()
    return service.generate_multi_filter_report(filters)


@router.get("/daily")
def get_daily_summary(
    date: str = Query(..., description="Date (YYYY-MM-DD)"),
    current_user: dict = Depends(require_supervisor_or_owner)
):
    """
    Get daily summary report for all operations

    **Access**: Restricted to supervisors and owners only

    Example: /reports/daily?date=2025-12-13
    """
    service = get_reporting_service()

    # Get all data for the date
    sales = service.filter_by_date_range(date, date)
    readings = service.filter_by_date_range(date, date, service.readings_data)
    reconciliations = service.filter_by_date_range(date, date, service.reconciliations_data)

    # Calculate totals
    total_revenue = sum(sale.get('total_amount', 0) for sale in sales)
    total_volume = sum(sale.get('volume', 0) for sale in sales)

    # Product breakdown
    product_breakdown = {}
    for product in ['Petrol', 'Diesel', 'LPG', 'Lubricants']:
        product_sales = service.filter_by_product(product, sales)
        product_breakdown[product] = {
            'transactions': len(product_sales),
            'revenue': sum(s.get('total_amount', 0) for s in product_sales),
            'volume': sum(s.get('volume', 0) for s in product_sales)
        }

    return {
        'date': date,
        'summary': {
            'total_transactions': len(sales),
            'total_revenue': total_revenue,
            'total_volume': total_volume,
            'total_readings': len(readings)
        },
        'product_breakdown': product_breakdown,
        'reconciliations': reconciliations,
        'top_staff': get_top_staff(sales),
        'top_nozzles': get_top_nozzles(readings)
    }


def get_top_staff(sales: List[dict], limit: int = 5) -> List[dict]:
    """Get top performing staff by revenue"""
    from collections import defaultdict

    staff_performance = defaultdict(lambda: {'transactions': 0, 'revenue': 0})

    for sale in sales:
        staff = sale.get('staff_name') or sale.get('attendant', 'Unknown')
        staff_performance[staff]['transactions'] += 1
        staff_performance[staff]['revenue'] += sale.get('total_amount', 0)

    # Sort by revenue
    sorted_staff = sorted(
        staff_performance.items(),
        key=lambda x: x[1]['revenue'],
        reverse=True
    )[:limit]

    return [
        {'staff_name': staff, **metrics}
        for staff, metrics in sorted_staff
    ]


def get_top_nozzles(readings: List[dict], limit: int = 5) -> List[dict]:
    """Get top performing nozzles by volume"""
    from collections import defaultdict

    nozzle_performance = defaultdict(lambda: {'readings': 0, 'volume': 0})

    for reading in readings:
        nozzle = reading.get('nozzle_id', 'Unknown')
        nozzle_performance[nozzle]['readings'] += 1
        nozzle_performance[nozzle]['volume'] += reading.get('volume', 0)

    # Sort by volume
    sorted_nozzles = sorted(
        nozzle_performance.items(),
        key=lambda x: x[1]['volume'],
        reverse=True
    )[:limit]

    return [
        {'nozzle_id': nozzle, **metrics}
        for nozzle, metrics in sorted_nozzles
    ]


@router.get("/monthly")
def get_monthly_summary(
    year: int = Query(..., description="Year (e.g., 2025)"),
    month: int = Query(..., description="Month (1-12)"),
    current_user: dict = Depends(require_supervisor_or_owner)
):
    """
    Get monthly summary report

    **Access**: Restricted to supervisors and owners only

    Example: /reports/monthly?year=2025&month=12
    """
    # Calculate date range
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    start_date = f"{year}-{month:02d}-01"
    end_date = f"{year}-{month:02d}-{last_day}"

    service = get_reporting_service()

    # Get all data for the month
    sales = service.filter_by_date_range(start_date, end_date)
    readings = service.filter_by_date_range(start_date, end_date, service.readings_data)
    reconciliations = service.filter_by_date_range(start_date, end_date, service.reconciliations_data)

    # Calculate totals
    total_revenue = sum(sale.get('total_amount', 0) for sale in sales)
    total_volume = sum(sale.get('volume', 0) for sale in sales)

    # Product breakdown
    product_breakdown = {}
    for product in ['Petrol', 'Diesel', 'LPG', 'Lubricants', 'Accessories']:
        product_sales = service.filter_by_product(product, sales)
        product_breakdown[product] = {
            'transactions': len(product_sales),
            'revenue': sum(s.get('total_amount', 0) for s in product_sales),
            'volume': sum(s.get('volume', 0) or s.get('quantity', 0) for s in product_sales)
        }

    # Daily breakdown
    from collections import defaultdict
    daily_breakdown = defaultdict(lambda: {'transactions': 0, 'revenue': 0})
    for sale in sales:
        date = sale.get('date', sale.get('timestamp', '')[:10])
        daily_breakdown[date]['transactions'] += 1
        daily_breakdown[date]['revenue'] += sale.get('total_amount', 0)

    return {
        'period': {
            'year': year,
            'month': month,
            'start_date': start_date,
            'end_date': end_date
        },
        'summary': {
            'total_transactions': len(sales),
            'total_revenue': total_revenue,
            'total_volume': total_volume,
            'total_readings': len(readings),
            'days_with_data': len(daily_breakdown)
        },
        'product_breakdown': product_breakdown,
        'daily_breakdown': dict(daily_breakdown),
        'reconciliations_count': len(reconciliations)
    }


# ==================== RELATIONSHIP ENDPOINTS ====================

@router.get("/relationships/{entity_type}/{entity_id}")
def get_entity_relationships(
    entity_type: str,
    entity_id: str
):
    """
    Get all related entities for a specific entity

    Entity types: staff, nozzle, island, shift, product

    Example: /reports/relationships/staff/John%20Doe
    Returns all nozzles, shifts, and products related to John Doe
    """
    relational_service = get_relational_service()
    return relational_service.get_entity_summary(entity_type, entity_id)


@router.get("/relationships/staff/{staff_name}/nozzles")
def get_staff_nozzles(staff_name: str):
    """Get all nozzles used by a specific staff member"""
    relational_service = get_relational_service()
    return {
        "staff_name": staff_name,
        "nozzles": relational_service.get_nozzles_by_staff(staff_name)
    }


@router.get("/relationships/staff/{staff_name}/shifts")
def get_staff_shifts_relation(staff_name: str):
    """Get all shifts worked by a specific staff member"""
    relational_service = get_relational_service()
    return {
        "staff_name": staff_name,
        "shifts": relational_service.get_shifts_by_staff(staff_name)
    }


@router.get("/relationships/nozzle/{nozzle_id}/staff")
def get_nozzle_staff(nozzle_id: str):
    """Get all staff who have used a specific nozzle"""
    relational_service = get_relational_service()
    return {
        "nozzle_id": nozzle_id,
        "staff": relational_service.get_staff_by_nozzle(nozzle_id)
    }


@router.get("/relationships/nozzle/{nozzle_id}/island")
def get_nozzle_island(nozzle_id: str):
    """Get the island that a nozzle belongs to"""
    relational_service = get_relational_service()
    return {
        "nozzle_id": nozzle_id,
        "island_id": relational_service.get_island_by_nozzle(nozzle_id)
    }


@router.get("/relationships/island/{island_id}/nozzles")
def get_island_nozzles_relation(island_id: str):
    """Get all nozzles on a specific island"""
    relational_service = get_relational_service()
    return {
        "island_id": island_id,
        "nozzles": relational_service.get_nozzles_by_island(island_id)
    }


@router.get("/relationships/island/{island_id}/staff")
def get_island_staff(island_id: str):
    """Get all staff who have worked on a specific island"""
    relational_service = get_relational_service()
    return {
        "island_id": island_id,
        "staff": relational_service.get_staff_by_island(island_id)
    }


@router.get("/relationships/product/{product_type}/nozzles")
def get_product_nozzles_relation(product_type: str):
    """Get all nozzles that dispense a specific product"""
    relational_service = get_relational_service()
    return {
        "product_type": product_type,
        "nozzles": relational_service.get_nozzles_by_product(product_type)
    }


@router.get("/relationships/product/{product_type}/staff")
def get_product_staff(product_type: str):
    """Get all staff who have handled a specific product"""
    relational_service = get_relational_service()
    return {
        "product_type": product_type,
        "staff": relational_service.get_staff_by_product(product_type)
    }


def load_all_sales_sources():
    """
    Load all sales types from their respective sources

    Returns:
        Dictionary with all sales data
    """
    from ...database.storage import STORAGE

    # Load fuel sales from JSON file
    fuel_sales = []
    sales_file = "storage/sales.json"
    if os.path.exists(sales_file):
        with open(sales_file, 'r') as f:
            fuel_sales = json.load(f)

    # Load other sales from in-memory storage
    credit_sales = STORAGE.get('credit_sales', [])
    lpg_sales = STORAGE.get('lpg_sales', [])
    lubricant_sales = STORAGE.get('lubricant_sales', [])
    accessory_sales = STORAGE.get('lpg_accessory_sales', [])

    return {
        'fuel_sales': fuel_sales,
        'credit_sales': credit_sales,
        'lpg_sales': lpg_sales,
        'lubricant_sales': lubricant_sales,
        'accessory_sales': accessory_sales
    }


@router.get("/date-range")
def get_date_range_report(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)", regex=r'^\d{4}-\d{2}-\d{2}$'),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)", regex=r'^\d{4}-\d{2}-\d{2}$'),
    product_type: Optional[str] = Query(None, description="Filter by product type (Petrol, Diesel, LPG, etc.)"),
    current_user: dict = Depends(require_supervisor_or_owner)
):
    """
    Get aggregated sales report for a custom date range

    **Access**: Restricted to supervisors and owners only

    **Parameters**:
    - start_date: Starting date (YYYY-MM-DD format)
    - end_date: Ending date (YYYY-MM-DD format)
    - product_type: Optional filter by specific product

    **Returns**:
    - Aggregated sales data by product type
    - Summary totals (transactions, revenue, volume)
    - Daily breakdown

    **Example**: /reports/date-range?start_date=2025-12-01&end_date=2025-12-31
    """
    # Validate dates
    try:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')

        if start_dt > end_dt:
            raise HTTPException(
                status_code=400,
                detail="start_date must be less than or equal to end_date"
            )

        # Check date range is not too large (max 1 year)
        delta_days = (end_dt - start_dt).days
        if delta_days > 365:
            raise HTTPException(
                status_code=400,
                detail="Date range cannot exceed 365 days"
            )

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format. Use YYYY-MM-DD format. Error: {str(e)}"
        )

    # Load all sales sources
    all_sales_sources = load_all_sales_sources()

    # Get reporting service
    service = get_reporting_service()

    # Aggregate sales by date range
    report_data = service.aggregate_sales_by_date_range(
        start_date=start_date,
        end_date=end_date,
        all_sales_sources=all_sales_sources
    )

    # Apply product filter if specified
    if product_type:
        filtered_products = [
            p for p in report_data['products']
            if p['product_type'].lower() == product_type.lower()
        ]

        if not filtered_products:
            # Return empty result if product not found
            return {
                'period': report_data['period'],
                'summary': {
                    'total_transactions': 0,
                    'total_revenue': 0.0,
                    'total_volume': 0.0
                },
                'products': [],
                'daily_breakdown': [],
                'filter': {'product_type': product_type},
                'message': f'No sales found for product type: {product_type}'
            }

        # Recalculate summary for filtered product
        filtered_summary = {
            'total_transactions': sum(p['transactions'] for p in filtered_products),
            'total_revenue': sum(p['revenue'] for p in filtered_products),
            'total_volume': sum(p['volume'] for p in filtered_products)
        }

        report_data['products'] = filtered_products
        report_data['summary'] = filtered_summary
        report_data['filter'] = {'product_type': product_type}

    # Add user info to response
    report_data['generated_by'] = {
        'user_id': current_user['user_id'],
        'username': current_user['username'],
        'role': current_user['role']
    }
    report_data['generated_at'] = datetime.now().isoformat()

    return report_data
