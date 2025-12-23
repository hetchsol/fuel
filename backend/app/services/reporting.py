"""
Advanced Reporting Service
Generates filtered reports based on staff, nozzle, island, pump, product, date range, etc.
"""
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from collections import defaultdict


class ReportingService:
    """
    Comprehensive reporting service with flexible filtering and aggregation
    """

    def __init__(
        self,
        sales_data: List[Dict[str, Any]],
        readings_data: List[Dict[str, Any]],
        shifts_data: List[Dict[str, Any]],
        reconciliations_data: List[Dict[str, Any]]
    ):
        """
        Initialize reporting service with all data sources

        Args:
            sales_data: All sales transactions
            readings_data: All meter readings
            shifts_data: All shift records
            reconciliations_data: All reconciliation records
        """
        self.sales_data = sales_data
        self.readings_data = readings_data
        self.shifts_data = shifts_data
        self.reconciliations_data = reconciliations_data

    def filter_by_staff(
        self,
        staff_name: str,
        data: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records by staff member

        Args:
            staff_name: Name of staff member
            data: Optional data to filter (defaults to sales_data)

        Returns:
            Filtered list of records
        """
        if data is None:
            data = self.sales_data

        return [
            record for record in data
            if record.get('staff_name', '').lower() == staff_name.lower() or
               record.get('attendant', '').lower() == staff_name.lower() or
               record.get('user', '').lower() == staff_name.lower()
        ]

    def filter_by_nozzle(
        self,
        nozzle_id: str,
        data: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records by nozzle ID

        Args:
            nozzle_id: Nozzle identifier (e.g., "ULP-001")
            data: Optional data to filter (defaults to readings_data)

        Returns:
            Filtered list of records
        """
        if data is None:
            data = self.readings_data

        return [
            record for record in data
            if record.get('nozzle_id', '') == nozzle_id
        ]

    def filter_by_island(
        self,
        island_id: str,
        data: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records by island

        Args:
            island_id: Island identifier (e.g., "ISLAND-1", "ISLAND-2")
            data: Optional data to filter

        Returns:
            Filtered list of records
        """
        if data is None:
            data = self.readings_data

        return [
            record for record in data
            if record.get('island_id', '') == island_id or
               record.get('nozzle_id', '').startswith(island_id)
        ]

    def filter_by_product(
        self,
        product_type: str,
        data: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records by product type (Petrol, Diesel, LPG, etc.)

        Args:
            product_type: Product type ("Petrol", "Diesel", "LPG", etc.)
            data: Optional data to filter

        Returns:
            Filtered list of records
        """
        if data is None:
            data = self.sales_data

        product_upper = product_type.upper()

        return [
            record for record in data
            if product_upper in record.get('product_type', '').upper() or
               product_upper in record.get('fuel_type', '').upper() or
               product_upper in record.get('nozzle_id', '').upper()
        ]

    def filter_by_date_range(
        self,
        start_date: str,
        end_date: str,
        data: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records by date range

        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            data: Optional data to filter

        Returns:
            Filtered list of records
        """
        if data is None:
            data = self.sales_data

        return [
            record for record in data
            if start_date <= record.get('date', '') <= end_date or
               start_date <= record.get('timestamp', '')[:10] <= end_date
        ]

    def filter_by_shift(
        self,
        shift_id: str,
        data: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Filter records by shift

        Args:
            shift_id: Shift identifier
            data: Optional data to filter

        Returns:
            Filtered list of records
        """
        if data is None:
            data = self.sales_data

        return [
            record for record in data
            if record.get('shift_id', '') == shift_id
        ]

    def generate_staff_report(
        self,
        staff_name: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive report for a specific staff member

        Args:
            staff_name: Name of staff member
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            Dictionary with staff performance metrics
        """
        # Filter by staff
        staff_sales = self.filter_by_staff(staff_name)
        staff_readings = self.filter_by_staff(staff_name, self.readings_data)

        # Apply date filter if provided
        if start_date and end_date:
            staff_sales = self.filter_by_date_range(start_date, end_date, staff_sales)
            staff_readings = self.filter_by_date_range(start_date, end_date, staff_readings)

        # Calculate metrics
        total_transactions = len(staff_sales)
        total_revenue = sum(sale.get('total_amount', 0) for sale in staff_sales)
        total_volume = sum(sale.get('volume', 0) for sale in staff_sales)

        # Group by product
        product_breakdown = defaultdict(lambda: {'count': 0, 'revenue': 0, 'volume': 0})
        for sale in staff_sales:
            product = sale.get('product_type') or sale.get('fuel_type', 'Unknown')
            product_breakdown[product]['count'] += 1
            product_breakdown[product]['revenue'] += sale.get('total_amount', 0)
            product_breakdown[product]['volume'] += sale.get('volume', 0)

        return {
            'staff_name': staff_name,
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': {
                'total_transactions': total_transactions,
                'total_revenue': total_revenue,
                'total_volume': total_volume,
                'total_readings': len(staff_readings)
            },
            'product_breakdown': dict(product_breakdown),
            'sales': staff_sales[:50],  # Latest 50 sales
            'readings': staff_readings[:50]  # Latest 50 readings
        }

    def generate_nozzle_report(
        self,
        nozzle_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive report for a specific nozzle

        Args:
            nozzle_id: Nozzle identifier
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            Dictionary with nozzle performance metrics
        """
        # Filter by nozzle
        nozzle_readings = self.filter_by_nozzle(nozzle_id)

        # Apply date filter if provided
        if start_date and end_date:
            nozzle_readings = self.filter_by_date_range(start_date, end_date, nozzle_readings)

        if not nozzle_readings:
            return {
                'nozzle_id': nozzle_id,
                'error': 'No data found for this nozzle'
            }

        # Calculate metrics
        total_volume = sum(r.get('volume', 0) for r in nozzle_readings)
        total_readings = len(nozzle_readings)

        # Get opening and closing readings
        sorted_readings = sorted(nozzle_readings, key=lambda x: x.get('timestamp', ''))
        opening_reading = sorted_readings[0].get('reading', 0) if sorted_readings else 0
        closing_reading = sorted_readings[-1].get('reading', 0) if sorted_readings else 0

        # Determine fuel type from nozzle ID
        fuel_type = 'Unknown'
        if 'ULP' in nozzle_id or 'PETROL' in nozzle_id.upper():
            fuel_type = 'Petrol'
        elif 'LSD' in nozzle_id or 'DIESEL' in nozzle_id.upper():
            fuel_type = 'Diesel'

        return {
            'nozzle_id': nozzle_id,
            'fuel_type': fuel_type,
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': {
                'total_readings': total_readings,
                'total_volume': total_volume,
                'opening_reading': opening_reading,
                'closing_reading': closing_reading,
                'meter_difference': closing_reading - opening_reading
            },
            'readings': nozzle_readings
        }

    def generate_island_report(
        self,
        island_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive report for a specific island

        Args:
            island_id: Island identifier
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            Dictionary with island performance metrics
        """
        # Filter by island
        island_readings = self.filter_by_island(island_id)

        # Apply date filter if provided
        if start_date and end_date:
            island_readings = self.filter_by_date_range(start_date, end_date, island_readings)

        # Group by nozzle
        nozzle_breakdown = defaultdict(lambda: {'count': 0, 'volume': 0})
        for reading in island_readings:
            nozzle = reading.get('nozzle_id', 'Unknown')
            nozzle_breakdown[nozzle]['count'] += 1
            nozzle_breakdown[nozzle]['volume'] += reading.get('volume', 0)

        total_volume = sum(n['volume'] for n in nozzle_breakdown.values())
        total_readings = sum(n['count'] for n in nozzle_breakdown.values())

        return {
            'island_id': island_id,
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': {
                'total_readings': total_readings,
                'total_volume': total_volume,
                'nozzle_count': len(nozzle_breakdown)
            },
            'nozzle_breakdown': dict(nozzle_breakdown),
            'readings': island_readings
        }

    def generate_product_report(
        self,
        product_type: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive report for a specific product

        Args:
            product_type: Product type (Petrol, Diesel, LPG, etc.)
            start_date: Optional start date
            end_date: Optional end date

        Returns:
            Dictionary with product performance metrics
        """
        # Filter by product
        product_sales = self.filter_by_product(product_type)

        # Apply date filter if provided
        if start_date and end_date:
            product_sales = self.filter_by_date_range(start_date, end_date, product_sales)

        # Calculate metrics
        total_transactions = len(product_sales)
        total_revenue = sum(sale.get('total_amount', 0) for sale in product_sales)
        total_volume = sum(sale.get('volume', 0) or sale.get('quantity', 0) for sale in product_sales)

        # Group by date
        daily_breakdown = defaultdict(lambda: {'count': 0, 'revenue': 0, 'volume': 0})
        for sale in product_sales:
            date = sale.get('date', sale.get('timestamp', '')[:10])
            daily_breakdown[date]['count'] += 1
            daily_breakdown[date]['revenue'] += sale.get('total_amount', 0)
            daily_breakdown[date]['volume'] += sale.get('volume', 0) or sale.get('quantity', 0)

        # Calculate averages
        num_days = len(daily_breakdown) or 1
        avg_daily_revenue = total_revenue / num_days
        avg_daily_volume = total_volume / num_days

        return {
            'product_type': product_type,
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': {
                'total_transactions': total_transactions,
                'total_revenue': total_revenue,
                'total_volume': total_volume,
                'avg_daily_revenue': avg_daily_revenue,
                'avg_daily_volume': avg_daily_volume,
                'days_with_data': num_days
            },
            'daily_breakdown': dict(daily_breakdown),
            'sales': product_sales[:100]  # Latest 100 sales
        }

    def generate_multi_filter_report(
        self,
        filters: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate report with multiple filters applied

        Args:
            filters: Dictionary of filter criteria
                {
                    'staff_name': 'John Doe',
                    'nozzle_id': 'ULP-001',
                    'product_type': 'Petrol',
                    'start_date': '2025-12-01',
                    'end_date': '2025-12-31',
                    'shift_id': 'SHIFT-001'
                }

        Returns:
            Filtered and aggregated report
        """
        # Start with all data
        filtered_data = self.sales_data.copy()

        # Apply each filter
        if filters.get('staff_name'):
            filtered_data = self.filter_by_staff(filters['staff_name'], filtered_data)

        if filters.get('product_type'):
            filtered_data = self.filter_by_product(filters['product_type'], filtered_data)

        if filters.get('start_date') and filters.get('end_date'):
            filtered_data = self.filter_by_date_range(
                filters['start_date'],
                filters['end_date'],
                filtered_data
            )

        if filters.get('shift_id'):
            filtered_data = self.filter_by_shift(filters['shift_id'], filtered_data)

        # Calculate aggregated metrics
        total_transactions = len(filtered_data)
        total_revenue = sum(item.get('total_amount', 0) for item in filtered_data)
        total_volume = sum(item.get('volume', 0) or item.get('quantity', 0) for item in filtered_data)

        return {
            'filters_applied': filters,
            'summary': {
                'total_transactions': total_transactions,
                'total_revenue': total_revenue,
                'total_volume': total_volume
            },
            'data': filtered_data
        }

    def aggregate_sales_by_date_range(
        self,
        start_date: str,
        end_date: str,
        all_sales_sources: Dict[str, List[Dict[str, Any]]]
    ) -> Dict[str, Any]:
        """
        Aggregate all sales types by date range with product breakdown

        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            all_sales_sources: Dictionary containing all sales data:
                {
                    'fuel_sales': List of fuel sales,
                    'credit_sales': List of credit sales,
                    'lpg_sales': List of LPG sales,
                    'lubricant_sales': List of lubricant sales,
                    'accessory_sales': List of accessory sales
                }

        Returns:
            Dictionary with aggregated data by product type
        """
        # Initialize aggregation dictionaries
        product_aggregates = defaultdict(lambda: {
            'product_type': '',
            'transactions': 0,
            'volume': 0.0,
            'revenue': 0.0,
            'unit': ''
        })

        daily_aggregates = defaultdict(lambda: {
            'date': '',
            'transactions': 0,
            'revenue': 0.0
        })

        total_transactions = 0
        total_revenue = 0.0
        total_volume = 0.0

        # Process fuel sales (Petrol and Diesel)
        fuel_sales = all_sales_sources.get('fuel_sales', [])
        for sale in fuel_sales:
            sale_date = sale.get('date', '')

            # Check if in date range
            if not (start_date <= sale_date <= end_date):
                continue

            fuel_type = sale.get('fuel_type', 'Unknown')
            volume = sale.get('average_volume', 0.0)
            revenue = sale.get('total_amount', 0.0)

            # Aggregate by product
            product_aggregates[fuel_type]['product_type'] = fuel_type
            product_aggregates[fuel_type]['transactions'] += 1
            product_aggregates[fuel_type]['volume'] += volume
            product_aggregates[fuel_type]['revenue'] += revenue
            product_aggregates[fuel_type]['unit'] = 'liters'

            # Aggregate by date
            daily_aggregates[sale_date]['date'] = sale_date
            daily_aggregates[sale_date]['transactions'] += 1
            daily_aggregates[sale_date]['revenue'] += revenue

            # Totals
            total_transactions += 1
            total_revenue += revenue
            total_volume += volume

        # Process credit sales
        credit_sales = all_sales_sources.get('credit_sales', [])
        for sale in credit_sales:
            sale_date = sale.get('date', '')

            if not (start_date <= sale_date <= end_date):
                continue

            fuel_type = sale.get('fuel_type', 'Credit')
            volume = sale.get('volume', 0.0)
            revenue = sale.get('amount', 0.0)

            # Add to fuel type aggregate (Petrol or Diesel credit)
            product_key = f"{fuel_type}"
            if product_key in product_aggregates:
                product_aggregates[product_key]['transactions'] += 1
                product_aggregates[product_key]['volume'] += volume
                product_aggregates[product_key]['revenue'] += revenue
            else:
                product_aggregates[fuel_type]['product_type'] = fuel_type
                product_aggregates[fuel_type]['transactions'] += 1
                product_aggregates[fuel_type]['volume'] += volume
                product_aggregates[fuel_type]['revenue'] += revenue
                product_aggregates[fuel_type]['unit'] = 'liters'

            daily_aggregates[sale_date]['date'] = sale_date
            daily_aggregates[sale_date]['transactions'] += 1
            daily_aggregates[sale_date]['revenue'] += revenue

            total_transactions += 1
            total_revenue += revenue
            total_volume += volume

        # Process LPG sales
        lpg_sales = all_sales_sources.get('lpg_sales', [])
        for sale in lpg_sales:
            # Extract date from shift_id or use date field
            sale_date = sale.get('date', '')

            if not sale_date or not (start_date <= sale_date <= end_date):
                continue

            quantity_kg = sale.get('quantity_kg', 0.0)
            revenue = sale.get('total_amount', 0.0)

            product_aggregates['LPG']['product_type'] = 'LPG'
            product_aggregates['LPG']['transactions'] += 1
            product_aggregates['LPG']['volume'] += quantity_kg
            product_aggregates['LPG']['revenue'] += revenue
            product_aggregates['LPG']['unit'] = 'kg'

            daily_aggregates[sale_date]['date'] = sale_date
            daily_aggregates[sale_date]['transactions'] += 1
            daily_aggregates[sale_date]['revenue'] += revenue

            total_transactions += 1
            total_revenue += revenue

        # Process lubricant sales
        lubricant_sales = all_sales_sources.get('lubricant_sales', [])
        for sale in lubricant_sales:
            sale_date = sale.get('date', '')

            if not sale_date or not (start_date <= sale_date <= end_date):
                continue

            quantity = sale.get('quantity', 0)
            revenue = sale.get('total_amount', 0.0)

            product_aggregates['Lubricants']['product_type'] = 'Lubricants'
            product_aggregates['Lubricants']['transactions'] += 1
            product_aggregates['Lubricants']['volume'] += quantity
            product_aggregates['Lubricants']['revenue'] += revenue
            product_aggregates['Lubricants']['unit'] = 'units'

            daily_aggregates[sale_date]['date'] = sale_date
            daily_aggregates[sale_date]['transactions'] += 1
            daily_aggregates[sale_date]['revenue'] += revenue

            total_transactions += 1
            total_revenue += revenue

        # Process accessory sales
        accessory_sales = all_sales_sources.get('accessory_sales', [])
        for sale in accessory_sales:
            sale_date = sale.get('date', '')

            if not sale_date or not (start_date <= sale_date <= end_date):
                continue

            quantity = sale.get('quantity', 0)
            revenue = sale.get('total_amount', 0.0)

            product_aggregates['Accessories']['product_type'] = 'Accessories'
            product_aggregates['Accessories']['transactions'] += 1
            product_aggregates['Accessories']['volume'] += quantity
            product_aggregates['Accessories']['revenue'] += revenue
            product_aggregates['Accessories']['unit'] = 'units'

            daily_aggregates[sale_date]['date'] = sale_date
            daily_aggregates[sale_date]['transactions'] += 1
            daily_aggregates[sale_date]['revenue'] += revenue

            total_transactions += 1
            total_revenue += revenue

        # Convert to lists and round values
        products_list = []
        for product_data in product_aggregates.values():
            products_list.append({
                'product_type': product_data['product_type'],
                'transactions': product_data['transactions'],
                'volume': round(product_data['volume'], 2),
                'revenue': round(product_data['revenue'], 2),
                'unit': product_data['unit']
            })

        # Sort products by revenue (highest first)
        products_list.sort(key=lambda x: x['revenue'], reverse=True)

        # Convert daily aggregates to list and sort by date
        daily_list = sorted(
            [data for data in daily_aggregates.values()],
            key=lambda x: x['date']
        )

        # Round daily revenue
        for day in daily_list:
            day['revenue'] = round(day['revenue'], 2)

        return {
            'period': {
                'start_date': start_date,
                'end_date': end_date
            },
            'summary': {
                'total_transactions': total_transactions,
                'total_revenue': round(total_revenue, 2),
                'total_volume': round(total_volume, 2)
            },
            'products': products_list,
            'daily_breakdown': daily_list
        }
