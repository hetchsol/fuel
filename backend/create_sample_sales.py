"""
Create sample sales data for testing date range reports
"""
import json
import os
from datetime import datetime, timedelta
import random

# Ensure storage directory exists
os.makedirs('storage', exist_ok=True)

# Generate sample sales for December 13-19, 2025
sales = []

# Fuel types and prices
fuel_types = [
    {"type": "Petrol", "price": 27.00},
    {"type": "Diesel", "price": 25.50}
]

# Generate sales for each day
start_date = datetime(2025, 12, 13)
for day_offset in range(7):  # 7 days of data
    current_date = start_date + timedelta(days=day_offset)
    date_str = current_date.strftime('%Y-%m-%d')

    # Generate 10-15 sales per day
    num_sales = random.randint(10, 15)

    for i in range(num_sales):
        fuel = random.choice(fuel_types)

        # Generate random but realistic readings
        opening = round(random.uniform(1000, 5000), 2)
        volume = round(random.uniform(20, 150), 2)
        closing = round(opening + volume, 2)

        # Add small discrepancy (within tolerance)
        electronic_volume = round(volume + random.uniform(-0.2, 0.2), 2)
        electronic_opening = round(random.uniform(1000, 5000), 2)
        electronic_closing = round(electronic_opening + electronic_volume, 2)

        average_volume = round((volume + electronic_volume) / 2, 2)
        total_amount = round(average_volume * fuel["price"], 2)

        # Determine shift (60% day, 40% night)
        shift_type = "DAY" if random.random() < 0.6 else "NIGHT"
        shift_id = f"{shift_type}_{current_date.day}_{current_date.month}_{current_date.year}"

        sale_id = f"SALE-{date_str}-{str(i+1).zfill(3)}"

        sale = {
            "sale_id": sale_id,
            "shift_id": shift_id,
            "fuel_type": fuel["type"],
            "mechanical_opening": opening,
            "mechanical_closing": closing,
            "electronic_opening": electronic_opening,
            "electronic_closing": electronic_closing,
            "mechanical_volume": volume,
            "electronic_volume": electronic_volume,
            "discrepancy_percent": round(abs(volume - electronic_volume) / average_volume * 100, 4),
            "validation_status": "PASS",
            "average_volume": average_volume,
            "unit_price": fuel["price"],
            "total_amount": total_amount,
            "validation_message": f"Readings match within tolerance",
            "date": date_str,
            "created_at": f"{date_str}T{random.randint(6, 22):02d}:{random.randint(0, 59):02d}:00"
        }

        sales.append(sale)

# Save to file
with open('storage/sales.json', 'w') as f:
    json.dump(sales, f, indent=2)

print(f"[OK] Created {len(sales)} sample sales records")
print(f"Date range: 2025-12-13 to 2025-12-19")
print(f"Saved to: storage/sales.json")
print(f"\nBreakdown:")

# Show breakdown by date
from collections import defaultdict
by_date = defaultdict(lambda: {"count": 0, "revenue": 0})
for sale in sales:
    by_date[sale["date"]]["count"] += 1
    by_date[sale["date"]]["revenue"] += sale["total_amount"]

for date in sorted(by_date.keys()):
    print(f"  {date}: {by_date[date]['count']} sales, K{by_date[date]['revenue']:,.2f} revenue")

print(f"\nTotal Revenue: K{sum(s['total_amount'] for s in sales):,.2f}")
print(f"Total Volume: {sum(s['average_volume'] for s in sales):,.2f} liters")
