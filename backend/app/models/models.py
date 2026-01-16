
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from enum import Enum

class UserRole(str, Enum):
    USER = "user"
    SUPERVISOR = "supervisor"
    OWNER = "owner"

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    user_id: str
    username: str
    full_name: str
    role: UserRole
    station_id: Optional[str] = None

class UserWithPassword(User):
    password: str

class ReadingIn(BaseModel):
    kind: str  # Opening|Closing|PreSale|PostSale
    manual_value: float
    attachment_id: Optional[str] = None
    ocr_conf_min: float = 0.85

class ReadingOut(BaseModel):
    status: str
    discrepancy: float
    reasons: List[str]
    reading_id: str

class SaleIn(BaseModel):
    shift_id: str
    fuel_type: str  # Diesel or Petrol
    mechanical_opening: float
    mechanical_closing: float
    electronic_opening: float
    electronic_closing: float

class SaleOut(BaseModel):
    sale_id: str
    shift_id: str
    fuel_type: str
    mechanical_opening: float
    mechanical_closing: float
    electronic_opening: float
    electronic_closing: float
    mechanical_volume: float
    electronic_volume: float
    discrepancy_percent: float
    validation_status: str  # PASS, FAIL
    average_volume: float
    unit_price: float
    total_amount: float
    validation_message: str
    date: Optional[str] = None
    created_at: Optional[str] = None

class FuelTankLevel(BaseModel):
    tank_id: str
    fuel_type: str  # Diesel or Petrol
    current_level: float  # Current fuel level in liters
    capacity: float  # Tank capacity in liters
    last_updated: str  # Timestamp of last update
    percentage: float  # Percentage full

class FuelSettings(BaseModel):
    diesel_price_per_liter: float
    petrol_price_per_liter: float
    diesel_allowable_loss_percent: float  # e.g., 0.3%
    petrol_allowable_loss_percent: float  # e.g., 0.5%

class ValidationThresholds(BaseModel):
    pass_threshold: float = 0.5  # Variance <= this % = PASS
    warning_threshold: float = 1.0  # Variance <= this % = WARNING
    # Variance > warning_threshold = FAIL

class SystemSettings(BaseModel):
    business_name: str
    license_key: str
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    license_expiry_date: Optional[str] = ""  # YYYY-MM-DD format
    software_version: str = "1.0.0"  # Read-only
    station_location: Optional[str] = ""

class StockDelivery(BaseModel):
    tank_id: str
    fuel_type: str  # Diesel or Petrol
    volume_delivered: float  # Liters delivered
    expected_volume: float  # Expected volume from supplier
    delivery_note: Optional[str] = None
    supplier: Optional[str] = None

class Nozzle(BaseModel):
    nozzle_id: str
    pump_station_id: str
    fuel_type: str  # Diesel or Petrol
    status: str  # Active, Inactive, Maintenance
    electronic_reading: Optional[float] = None  # Current cumulative electronic reading
    mechanical_reading: Optional[float] = None  # Current cumulative mechanical reading

class PumpStation(BaseModel):
    pump_station_id: str
    island_id: str
    name: str
    tank_id: str  # Which tank this pump draws fuel from (TANK-DIESEL or TANK-PETROL)
    nozzles: List[Nozzle]

class Island(BaseModel):
    island_id: str
    name: str
    location: Optional[str] = None
    pump_station: Optional[PumpStation] = None

# Shift Management
class ShiftType(str, Enum):
    DAY = "Day"
    NIGHT = "Night"

class AttendantAssignment(BaseModel):
    attendant_id: str
    attendant_name: str
    island_ids: List[str] = []
    nozzle_ids: List[str] = []

class TankDipReading(BaseModel):
    tank_id: str
    opening_dip_cm: Optional[float] = None
    closing_dip_cm: Optional[float] = None
    opening_volume_liters: Optional[float] = None
    closing_volume_liters: Optional[float] = None

class Shift(BaseModel):
    shift_id: str
    date: str  # YYYY-MM-DD
    shift_type: ShiftType
    attendants: List[str]  # List of attendant names (backward compatibility)
    assignments: List[AttendantAssignment] = []  # Detailed assignments
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: str = "active"  # active, completed, reconciled
    created_by: Optional[str] = None  # User ID who created the shift
    created_at: Optional[str] = None  # Timestamp
    tank_dip_readings: List[TankDipReading] = []  # Tank dip readings for this shift

    class Config:
        # Ensure all fields are included in dict/JSON output
        use_enum_values = True

# Dual Reading Entry
class DualReading(BaseModel):
    nozzle_id: str
    shift_id: str
    attendant: str
    reading_type: str  # Opening or Closing
    electronic_reading: float
    mechanical_reading: float
    timestamp: str
    tank_dip_cm: Optional[float] = None  # Tank dip in centimeters (if applicable)

# Validated Triple Reading (Mechanical, Electronic, Dip)
class ValidatedReadingInput(BaseModel):
    shift_id: str
    tank_id: str
    reading_type: str  # Opening or Closing
    mechanical_reading: float
    electronic_reading: float
    dip_reading_cm: float  # Tank dip in centimeters
    recorded_by: str  # User ID of person recording (typically owner)
    notes: Optional[str] = None

class ValidatedReadingOutput(BaseModel):
    reading_id: str
    shift_id: str
    tank_id: str
    reading_type: str
    mechanical_reading: float
    electronic_reading: float
    dip_reading_cm: float
    dip_reading_liters: float  # Converted from cm to liters
    recorded_by: str
    timestamp: str
    validation_status: str  # PASS, FAIL, WARNING
    discrepancy_mech_elec_percent: float  # % difference between mechanical and electronic
    discrepancy_mech_dip_percent: float   # % difference between mechanical and dip
    discrepancy_elec_dip_percent: float   # % difference between electronic and dip
    max_discrepancy_percent: float  # Maximum discrepancy among all three
    validation_message: str
    notes: Optional[str] = None

class NozzleShiftSummary(BaseModel):
    nozzle_id: str
    shift_id: str
    attendant: str
    electronic_opening: float
    electronic_closing: float
    electronic_movement: float
    mechanical_opening: float
    mechanical_closing: float
    mechanical_movement: float
    discrepancy: float  # electronic_movement - mechanical_movement

# Tank Reconciliation
class TankReconciliation(BaseModel):
    tank_id: str
    shift_id: str
    opening_dip_cm: float
    closing_dip_cm: float
    opening_volume_liters: float
    closing_volume_liters: float
    delivery_volume: Optional[float] = 0.0
    total_electronic_sales: float
    total_mechanical_sales: float
    tank_movement: float
    electronic_vs_tank_discrepancy: float
    mechanical_vs_tank_discrepancy: float

# Account Holders / Credit Sales
class AccountHolder(BaseModel):
    account_id: str
    account_name: str
    account_type: str  # POS, Institution, Corporate, Individual
    credit_limit: float
    current_balance: float
    contact_person: Optional[str] = None
    phone: Optional[str] = None

# Customer Allocation Models (Diesel Customer Types)
class Customer(BaseModel):
    """Master customer definition for customer allocation (Diesel only)"""
    customer_id: str
    customer_name: str
    customer_type: str  # Drive-In, Corporate, Institution, etc.
    default_price_per_liter: Optional[float] = None  # Can override default diesel price
    is_active: bool = True
    notes: Optional[str] = None

class CustomerAllocation(BaseModel):
    """Volume allocation to a specific customer (Diesel only)"""
    customer_id: str
    customer_name: str  # Denormalized for convenience
    volume: float  # Liters allocated to this customer
    price_per_liter: float  # Price for this customer (can differ from default)
    amount: float  # Calculated: volume * price_per_liter

class CreditSale(BaseModel):
    sale_id: str
    account_id: str
    shift_id: str
    date: str
    fuel_type: str
    volume: float
    amount: float
    invoice_number: Optional[str] = None

# Delivery Reference for Multiple Deliveries Support
class DeliveryReference(BaseModel):
    """Reference to a delivery within a tank reading (supports multiple deliveries per shift)"""
    delivery_id: Optional[str] = None  # FK to tank_deliveries_db, or None for new inline delivery
    volume_delivered: float  # Liters delivered
    delivery_time: str  # HH:MM format
    supplier: str
    invoice_number: Optional[str] = None
    before_volume: float  # Tank level before this specific delivery
    after_volume: float   # Tank level after this specific delivery

# LPG Products
class LPGSale(BaseModel):
    sale_id: str
    shift_id: str
    cylinder_size: str  # 6kg, 9kg, 13kg, etc.
    quantity_kg: float
    price_per_kg: float
    total_amount: float
    customer_name: Optional[str] = None
    sale_type: str  # Refill or New

class LPGAccessory(BaseModel):
    product_code: str
    description: str
    unit_price: float
    opening_stock: int
    current_stock: int

class LPGAccessorySale(BaseModel):
    sale_id: str
    shift_id: str
    product_code: str
    quantity: int
    unit_price: float
    total_amount: float

# Lubricants
class Lubricant(BaseModel):
    product_code: str
    description: str
    category: str  # Engine Oil, Transmission Fluid, Brake Fluid, etc.
    unit_price: float
    location: str  # Island 3 or Buffer
    opening_stock: int
    current_stock: int

class LubricantSale(BaseModel):
    sale_id: str
    shift_id: str
    product_code: str
    quantity: int
    unit_price: float
    total_amount: float

# Comprehensive Shift Reconciliation
class ShiftReconciliation(BaseModel):
    shift_id: str
    date: str
    shift_type: ShiftType
    petrol_revenue: float
    diesel_revenue: float
    lpg_revenue: float
    lubricants_revenue: float
    accessories_revenue: float
    total_expected: float
    credit_sales_total: float
    expected_cash: float
    actual_deposited: Optional[float] = None
    difference: Optional[float] = None
    cumulative_difference: float
    notes: Optional[str] = None

# Nozzle Reading for Daily Tank Reading Integration
class NozzleReadingDetail(BaseModel):
    """Individual nozzle reading within a daily tank reading"""
    nozzle_id: str
    attendant: str  # Attendant name
    electronic_opening: float
    electronic_closing: float
    electronic_movement: float  # Auto-calculated: closing - opening
    mechanical_opening: float
    mechanical_closing: float
    mechanical_movement: float  # Auto-calculated: closing - opening

# Tank Volume Movement - Enhanced Tank Readings (Excel Columns D-AL Implementation)
class TankVolumeReadingInput(BaseModel):
    """Input model for submitting comprehensive daily tank readings matching Excel structure"""
    tank_id: str
    date: str  # YYYY-MM-DD
    shift_type: str  # Day or Night

    # Tank Dip Readings in Centimeters (Columns AF, AG, AH)
    opening_dip_cm: float  # AF - Physical dip measurement at start
    closing_dip_cm: float  # AH - Physical dip measurement at end
    after_delivery_dip_cm: Optional[float] = None  # AG - Dip after delivery (if delivery occurred)

    # Tank Volume Readings in Liters (Columns AI, AJ, AK, AL)
    # These can be auto-calculated from dip readings or manually entered
    opening_volume: Optional[float] = None  # AI - Converted from dip or manual
    closing_volume: Optional[float] = None  # AL - Converted from dip or manual
    before_offload_volume: Optional[float] = None  # AJ - Before delivery
    after_offload_volume: Optional[float] = None   # AK - After delivery

    # Nozzle Readings (Columns D-AE) - All nozzles for this tank
    nozzle_readings: List[NozzleReadingDetail] = []

    # NEW: Multiple deliveries support
    deliveries: List[DeliveryReference] = []  # Empty list = no deliveries

    # DEPRECATED: Delivery information (kept for backward compatibility)
    delivery_occurred: bool = False
    delivery_time: Optional[str] = None  # HH:MM
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None
    delivery_note: Optional[str] = None

    # Financial Data (Columns AR-AU)
    price_per_liter: Optional[float] = None  # AR - Current selling price
    actual_cash_banked: Optional[float] = None  # AT - Actual cash deposited

    # Customer Allocation (DIESEL ONLY - Columns AR-BB)
    # How diesel volume is allocated to different customer types
    customer_allocations: List[CustomerAllocation] = []

    # Who recorded this
    recorded_by: str  # User ID
    notes: Optional[str] = None

class TankVolumeReadingOutput(BaseModel):
    """Output model with all calculated fields matching Excel structure"""
    model_config = ConfigDict(
        # Always serialize all fields, even if they have default values or are None
        use_enum_values=True,
        validate_assignment=True
    )

    reading_id: str
    tank_id: str
    fuel_type: str  # Diesel or Petrol
    date: str
    shift_type: str  # Day or Night

    # Tank Dip Readings (Columns AF, AG, AH)
    opening_dip_cm: float
    closing_dip_cm: float
    after_delivery_dip_cm: Optional[float] = None

    # Tank Volume Readings (Columns AI, AJ, AK, AL)
    opening_volume: float
    closing_volume: float
    before_offload_volume: Optional[float] = None
    after_offload_volume: Optional[float] = None

    # Nozzle Readings (Columns D-AE)
    nozzle_readings: List[NozzleReadingDetail] = []

    # Calculated Tank Movement (Column AM)
    tank_volume_movement: float  # =IF(AL>0,IF(AK>0,(AK-AL)+(AI-AJ),AI-AL),0)

    # Calculated Totals from Nozzles (Columns AN, AO)
    total_electronic_dispensed: float  # AN - Sum of all nozzle electronic movements
    total_mechanical_dispensed: float  # AO - Sum of all nozzle mechanical movements

    # Variance Analysis (Columns AP, AQ)
    electronic_vs_tank_variance: float  # AP = AN - AM
    mechanical_vs_tank_variance: float  # AQ = AO - AM
    electronic_vs_tank_percent: float  # AP/AM as percentage
    mechanical_vs_tank_percent: float  # AQ/AM as percentage

    # Financial Calculations (Columns AR-AW, BF)
    price_per_liter: Optional[float] = None  # AR
    expected_amount_electronic: Optional[float] = None  # AS = AR * AN
    expected_amount_mechanical: Optional[float] = None  # AR * AO
    actual_cash_banked: Optional[float] = None  # AT
    cash_difference: Optional[float] = None  # AU = AT - AS
    cumulative_volume_sold: Optional[float] = None  # AV = (AN+AO)/2
    loss_percent: Optional[float] = None  # BF = AP/AM

    # Customer Allocation (DIESEL ONLY - Columns AR-BB)
    customer_allocations: List[CustomerAllocation] = []
    allocation_balance_check: Optional[float] = None  # AW = AN - sum(allocations) - should be zero
    total_customer_revenue: Optional[float] = None  # Sum of all customer amounts

    # NEW: Multiple deliveries support
    deliveries: List[DeliveryReference] = []
    total_delivery_volume: float = 0.0  # Sum of all deliveries
    delivery_count: int = 0

    # Inter-delivery sales timeline (when multiple deliveries occur)
    delivery_timeline: Optional[dict] = None  # Timeline of sales between deliveries

    # DEPRECATED: Delivery Information (kept for backward compatibility display)
    delivery_occurred: bool
    delivery_volume: Optional[float] = None  # AK - AJ
    delivery_time: Optional[str] = None
    supplier: Optional[str] = None
    invoice_number: Optional[str] = None

    # Pump Averages (Columns AY-BB) - if applicable
    pump_averages: Optional[dict] = None

    # Validation
    validation_status: str  # PASS, WARNING, FAIL
    validation_messages: List[str] = []
    has_discrepancy: bool  # True if variances exceed thresholds

    # Metadata
    recorded_by: str
    created_at: str
    notes: Optional[str] = None

class TankDeliveryInput(BaseModel):
    """Input model for recording fuel deliveries"""
    tank_id: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM

    # Volume readings
    volume_before: float  # Tank level before delivery
    volume_after: float   # Tank level after delivery

    # Delivery details
    supplier: str
    invoice_number: Optional[str] = None
    expected_volume: Optional[float] = None  # What supplier said they delivered
    temperature: Optional[float] = None  # Temperature at delivery

    # Who recorded
    recorded_by: str
    notes: Optional[str] = None

class TankDeliveryOutput(BaseModel):
    """Output model for delivery records"""
    delivery_id: str
    tank_id: str
    fuel_type: str
    date: str
    time: str

    # Volumes
    volume_before: float
    volume_after: float
    actual_volume_delivered: float  # Calculated: after - before
    expected_volume: Optional[float] = None
    delivery_variance: Optional[float] = None  # actual - expected
    variance_percent: Optional[float] = None

    # Details
    supplier: str
    invoice_number: Optional[str] = None
    temperature: Optional[float] = None

    # Validation
    validation_status: str  # PASS, WARNING, FAIL
    validation_message: str

    # NEW: Link to tank reading (for auto-linking functionality)
    linked_reading_id: Optional[str] = None  # FK to tank_readings

    # Metadata
    recorded_by: str
    created_at: str
    notes: Optional[str] = None

class TankMovementSummary(BaseModel):
    """Summary report for tank movement over a period"""
    tank_id: str
    fuel_type: str
    start_date: str
    end_date: str

    # Volume summary
    total_volume_dispensed: float  # Sum of all tank movements
    total_deliveries: float
    total_electronic_sales: float
    total_mechanical_sales: float

    # Averages
    average_daily_movement: float

    # Variances
    total_electronic_variance: float  # Total (Electronic - Tank)
    total_mechanical_variance: float  # Total (Mechanical - Tank)
    average_variance_percent: float

    # Counts
    number_of_days: int
    number_of_deliveries: int

    # Status
    overall_status: str  # GOOD, WARNING, CRITICAL
    loss_detected: bool
    estimated_loss_volume: Optional[float] = None
