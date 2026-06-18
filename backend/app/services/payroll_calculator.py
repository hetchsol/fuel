"""
Payroll calculation engine — pure functions, no DB calls.
All monetary values in ZMW. Rounding: half-up to 2 decimal places.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Optional, Tuple


def _r(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def calculate_paye(taxable_income: float, paye_bands: List[Dict]) -> float:
    """Progressive ZRA PAYE bands applied to taxable income."""
    tax = 0.0
    for band in sorted(paye_bands, key=lambda b: float(b["min"])):
        b_min = float(band["min"])
        b_max = float(band["max"]) if band.get("max") is not None else float("inf")
        rate = float(band["rate"])
        if taxable_income <= b_min:
            break
        taxable_in_band = min(taxable_income, b_max) - b_min
        tax += taxable_in_band * rate
    return _r(tax)


def calculate_overtime_pay(
    basic_salary: float,
    contracted_hours_per_week: int,
    overtime_entries: List[Dict],
    weekday_multiplier: float,
    weekend_multiplier: float,
) -> Tuple[float, List[Dict]]:
    """
    Returns (total_overtime_pay, detail_list).
    overtime_entries: list of attendance_records with overtime_hours > 0.
    """
    monthly_hours = contracted_hours_per_week * 52 / 12
    hourly_rate = _r(basic_salary / monthly_hours) if monthly_hours > 0 else 0.0

    total = 0.0
    details = []
    for entry in overtime_entries:
        hours = float(entry.get("overtime_hours", 0))
        if hours <= 0:
            continue
        ot_type = entry.get("overtime_type", "weekday")
        multiplier = weekend_multiplier if ot_type in ("weekend", "public_holiday") else weekday_multiplier
        pay = _r(hours * hourly_rate * multiplier)
        total += pay
        details.append({
            "date": str(entry.get("work_date", "")),
            "overtime_type": ot_type,
            "hours": hours,
            "hourly_rate": hourly_rate,
            "multiplier": multiplier,
            "pay": pay,
        })
    return _r(total), details


def calculate_payslip(
    profile: Dict,
    rates: Dict,
    wcf_rate: float,
    overtime_entries: List[Dict],
    active_advances: List[Dict],
    attendance_days: Optional[int] = None,
    leave_days_taken: Optional[float] = None,
) -> Dict:
    """
    Compute all payslip fields from inputs.
    Overrides are all None at creation — applied later via PATCH /overrides.
    """
    basic = float(profile.get("basic_salary", 0))
    housing = float(profile.get("housing_allowance", 0))
    transport = float(profile.get("transport_allowance", 0))
    contracted_hours = int(profile.get("contracted_hours_per_week", 48))

    paye_bands = rates.get("paye_bands", [])
    napsa_emp_rate = float(rates.get("napsa_employee_rate", 0.05))
    napsa_emr_rate = float(rates.get("napsa_employer_rate", 0.05))
    napsa_ceiling = float(rates.get("napsa_monthly_ceiling", 1073.18))
    nhima_emp_rate = float(rates.get("nhima_employee_rate", 0.01))
    nhima_emr_rate = float(rates.get("nhima_employer_rate", 0.01))
    weekday_mult = float(rates.get("overtime_weekday_multiplier", 1.5))
    weekend_mult = float(rates.get("overtime_weekend_multiplier", 2.0))

    overtime_pay, overtime_details = calculate_overtime_pay(
        basic, contracted_hours, overtime_entries, weekday_mult, weekend_mult
    )

    gross = _r(basic + housing + transport + overtime_pay)

    napsa_employee_calc = _r(min(gross * napsa_emp_rate, napsa_ceiling))
    napsa_employer = _r(min(gross * napsa_emr_rate, napsa_ceiling))
    nhima_employee_calc = _r(gross * nhima_emp_rate)
    nhima_employer = _r(gross * nhima_emr_rate)
    wcf_employer = _r(gross * wcf_rate)

    taxable_income = _r(gross - napsa_employee_calc)
    paye_calc = calculate_paye(taxable_income, paye_bands)

    advances_deducted = _r(sum(
        min(float(a.get("monthly_deduction", 0)), float(a.get("outstanding_balance", 0)))
        for a in active_advances
    ))

    total_deductions = _r(napsa_employee_calc + nhima_employee_calc + paye_calc + advances_deducted)
    net_pay = _r(gross - total_deductions)
    total_employer_cost = _r(gross + napsa_employer + nhima_employer + wcf_employer)

    return {
        "basic_salary": basic,
        "housing_allowance": housing,
        "transport_allowance": transport,
        "other_allowances": 0.0,
        "overtime_pay": overtime_pay,
        "overtime_details": overtime_details,
        "gross_salary": gross,
        "napsa_employee_calc": napsa_employee_calc,
        "nhima_employee_calc": nhima_employee_calc,
        "paye_calc": paye_calc,
        "napsa_employee_override": None,
        "nhima_employee_override": None,
        "paye_override": None,
        "custom_deductions": [],
        "advances_deducted": advances_deducted,
        "total_deductions": total_deductions,
        "net_pay": net_pay,
        "napsa_employer": napsa_employer,
        "nhima_employer": nhima_employer,
        "wcf_employer": wcf_employer,
        "total_employer_cost": total_employer_cost,
        "attendance_days": attendance_days,
        "leave_days_taken": leave_days_taken,
    }


def recompute_totals(payslip: Dict) -> Dict:
    """
    Recompute total_deductions and net_pay after overrides are applied.
    Each statutory line uses override if set, else calculated value.
    """
    napsa = float(payslip.get("napsa_employee_override") or payslip.get("napsa_employee_calc", 0))
    nhima = float(payslip.get("nhima_employee_override") or payslip.get("nhima_employee_calc", 0))
    paye = float(payslip.get("paye_override") or payslip.get("paye_calc", 0))
    advances = float(payslip.get("advances_deducted", 0))
    custom = _r(sum(float(d.get("amount", 0)) for d in (payslip.get("custom_deductions") or [])))

    total_deductions = _r(napsa + nhima + paye + advances + custom)
    net_pay = _r(float(payslip.get("gross_salary", 0)) - total_deductions)
    return {**payslip, "total_deductions": total_deductions, "net_pay": net_pay}


def aggregate_run_totals(payslips: List[Dict]) -> Dict:
    """Sum individual payslip fields into payroll_run-level totals."""
    def _s(field): return _r(sum(float(p.get(field, 0)) for p in payslips))

    return {
        "total_gross": _s("gross_salary"),
        "total_basic": _s("basic_salary"),
        "total_allowances": _r(sum(
            float(p.get("housing_allowance", 0))
            + float(p.get("transport_allowance", 0))
            + float(p.get("other_allowances", 0))
            for p in payslips
        )),
        "total_overtime": _s("overtime_pay"),
        "total_paye": _r(sum(
            float(p.get("paye_override") or p.get("paye_calc", 0)) for p in payslips
        )),
        "total_napsa_employee": _r(sum(
            float(p.get("napsa_employee_override") or p.get("napsa_employee_calc", 0)) for p in payslips
        )),
        "total_napsa_employer": _s("napsa_employer"),
        "total_nhima_employee": _r(sum(
            float(p.get("nhima_employee_override") or p.get("nhima_employee_calc", 0)) for p in payslips
        )),
        "total_nhima_employer": _s("nhima_employer"),
        "total_wcf_employer": _s("wcf_employer"),
        "total_advances": _s("advances_deducted"),
        "total_net": _s("net_pay"),
        "total_employer_cost": _s("total_employer_cost"),
    }
