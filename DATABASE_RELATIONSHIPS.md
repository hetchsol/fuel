# Database Relationships & Date Format Guide

## Date Format Standard

**All dates in the system use DD-MM-YYYY format for display and user input.**

### Date Format Usage

#### Backend
- Display to users: `DD-MM-YYYY`
- Internal processing: `YYYY-MM-DD` (ISO format)
- Use `app/utils/date_formats.py` for all date conversions

```python
from app.utils.date_formats import format_date_to_display, format_date_to_iso

# Convert from ISO to display
display_date = format_date_to_display("2025-12-14")  # Returns "14-12-2025"

# Convert from display to ISO
iso_date = format_date_to_iso("14-12-2025")  # Returns "2025-12-14"
```

#### Frontend
- Display to users: `DD-MM-YYYY`
- Date inputs: `YYYY-MM-DD` (HTML5 date input requirement)
- Use `lib/dateUtils.ts` for all date conversions

```typescript
import { formatDateToDisplay, formatDateToISO } from '../lib/dateUtils'

// Convert from ISO to display
const displayDate = formatDateToDisplay("2025-12-14")  // Returns "14-12-2025"

// Convert from display to ISO (for API calls)
const isoDate = formatDateToISO("14-12-2025")  // Returns "2025-12-14"
```

---

## Database Relationships

The system implements a fully relational data model where all entities are connected through foreign keys.

### Entity Relationship Diagram

```
Users (Staff)
  └─ 1:N → Readings
  └─ 1:N → Sales
  └─ 1:N → Shifts (as supervisor)

Shifts
  ├─ N:1 → Users (supervisor)
  ├─ 1:N → Readings
  ├─ 1:N → Sales
  └─ 1:1 → Reconciliation

Islands
  └─ 1:N → Nozzles
  └─ 1:N → Readings

Nozzles
  ├─ N:1 → Islands
  ├─ 1:N → Readings
  └─ 1:N → Sales

Tanks
  ├─ 1:N → Dip Readings
  └─ 1:N → Deliveries

Accounts (Credit Customers)
  └─ 1:N → Sales

Products (LPG, Lubricants)
  └─ 1:N → Sales
```

### Core Relationships

#### 1. Staff → Nozzles (through Readings)
**Relationship**: Many-to-Many (a staff member uses many nozzles, a nozzle is used by many staff)

```python
# Get all nozzles used by a staff member
GET /api/v1/reports/relationships/staff/{staff_name}/nozzles
```

#### 2. Staff → Shifts
**Relationship**: Many-to-Many (a staff member works many shifts, a shift has many staff)

```python
# Get all shifts worked by a staff member
GET /api/v1/reports/relationships/staff/{staff_name}/shifts
```

#### 3. Nozzle → Island
**Relationship**: Many-to-One (many nozzles belong to one island)

```python
# Get the island that a nozzle belongs to
GET /api/v1/reports/relationships/nozzle/{nozzle_id}/island
```

#### 4. Nozzle → Staff (through Readings)
**Relationship**: Many-to-Many

```python
# Get all staff who have used a nozzle
GET /api/v1/reports/relationships/nozzle/{nozzle_id}/staff
```

#### 5. Island → Nozzles
**Relationship**: One-to-Many (one island has many nozzles)

```python
# Get all nozzles on an island
GET /api/v1/reports/relationships/island/{island_id}/nozzles
```

#### 6. Island → Staff (through Readings)
**Relationship**: Many-to-Many

```python
# Get all staff who have worked on an island
GET /api/v1/reports/relationships/island/{island_id}/staff
```

#### 7. Product → Nozzles
**Relationship**: One-to-Many (one product type dispensed by many nozzles)

```python
# Get all nozzles that dispense a product
GET /api/v1/reports/relationships/product/{product_type}/nozzles
```

#### 8. Product → Staff (through Readings)
**Relationship**: Many-to-Many

```python
# Get all staff who have handled a product
GET /api/v1/reports/relationships/product/{product_type}/staff
```

---

## API Endpoints for Relationships

### Get Complete Entity Summary

Get all related entities for any entity in one call:

```http
GET /api/v1/reports/relationships/{entity_type}/{entity_id}
```

**Entity Types**: `staff`, `nozzle`, `island`, `shift`, `product`

**Example**:
```http
GET /api/v1/reports/relationships/staff/John%20Doe

Response:
{
  "entity_type": "staff",
  "entity_id": "John Doe",
  "nozzles_used": ["ULP-001", "LSD-002"],
  "shifts_worked": 15,
  "products_handled": ["Petrol", "Diesel"]
}
```

### Specific Relationship Queries

| Endpoint | Description |
|----------|-------------|
| `GET /reports/relationships/staff/{name}/nozzles` | Nozzles used by staff member |
| `GET /reports/relationships/staff/{name}/shifts` | Shifts worked by staff member |
| `GET /reports/relationships/nozzle/{id}/staff` | Staff who used the nozzle |
| `GET /reports/relationships/nozzle/{id}/island` | Island the nozzle belongs to |
| `GET /reports/relationships/island/{id}/nozzles` | Nozzles on the island |
| `GET /reports/relationships/island/{id}/staff` | Staff who worked on the island |
| `GET /reports/relationships/product/{type}/nozzles` | Nozzles that dispense the product |
| `GET /reports/relationships/product/{type}/staff` | Staff who handled the product |

---

## Using Relationships in Reports

### Example 1: Staff Performance with Context

When generating a staff report, the system automatically includes:
- All nozzles the staff member has used
- All shifts they worked
- All products they handled
- Performance metrics for each relationship

### Example 2: Nozzle Analysis with Context

When generating a nozzle report, the system includes:
- The island it belongs to
- All staff members who used it
- All shifts it was active
- Volume dispensed per staff member

### Example 3: Cross-Entity Filtering

Generate reports filtered by multiple related entities:

```http
GET /api/v1/reports/custom?staff_name=John&nozzle_id=ULP-001&start_date=01-12-2025&end_date=14-12-2025
```

This returns data for:
- Staff member "John"
- Using nozzle "ULP-001"
- Between the specified dates

---

## Implementation Details

### Backend Services

1. **RelationalQueryService** (`app/services/relational_queries.py`)
   - Handles all relationship queries
   - Provides methods to traverse entity relationships
   - Used by reports API

2. **Database Schema** (`app/database/schema.py`)
   - Defines all entity relationships
   - Documents foreign key constraints
   - Provides query templates

### Frontend Integration

The frontend can use these relationships to:
1. **Populate cascading dropdowns** - Select staff → show their nozzles
2. **Context-aware filtering** - Select nozzle → filter by its island
3. **Smart suggestions** - Show related entities while filtering

### Data Flow

```
User Action → Frontend Request → API Endpoint → Relational Service → Multiple Data Stores → Related Entities → Response
```

---

## Migration from Old System

If migrating from a non-relational system:

1. **Map existing data** to the entity structure
2. **Establish foreign keys** by matching IDs
3. **Validate relationships** using the relationship endpoints
4. **Update date formats** from YYYY-MM-DD to DD-MM-YYYY for display

---

## Best Practices

1. **Always use date utility functions** - Never format dates manually
2. **Query relationships through the API** - Don't duplicate relationship logic
3. **Cache relationship data** - Related entities don't change often
4. **Use entity summaries** - One API call gets all relationships
5. **Follow foreign key constraints** - Don't create orphaned records

---

## Testing Relationships

```bash
# Test staff relationships
curl "http://localhost:8000/api/v1/reports/relationships/staff/John%20Doe"

# Test nozzle relationships
curl "http://localhost:8000/api/v1/reports/relationships/nozzle/ULP-001"

# Test product relationships
curl "http://localhost:8000/api/v1/reports/relationships/product/Petrol/staff"
```

---

## Future Enhancements

- Add database foreign key constraints in production database
- Implement caching for frequently accessed relationships
- Add relationship visualization in frontend
- Create automated relationship validation tests
