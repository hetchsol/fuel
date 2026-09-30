"""
Guardrail (Phase 4 of the duplicate-handover remediation): nothing outside
app/services/handover_lookup.py should filter attendant_handovers.json by
BOTH shift_id and attendant_id together. Every time that pattern got
hand-rolled somewhere new, it picked up its own slightly-wrong exclusion
rules - the duplicate-reading gate forgot "returned", shift completion
picked the newest handover instead of the resolved one, the tank-vs-nozzle
variance check had no exclusion at all, and three more instances turned up
in a single audit pass while building this guardrail (get_my_shift,
manager_retro_entry, exclude_reading).

This test greps the source for that pattern and fails on anything not in
the explicit ALLOWED list below. If you're adding a new place that needs
"the handover(s) for this shift+attendant pair":
  - If it needs THE CURRENT one (live data, flags, shift completion): call
    get_canonical_handover / get_active_handover / get_canonical_nozzle_summaries
    from handover_lookup.py instead of writing this filter by hand.
  - If it genuinely needs to bypass canonical-ness on purpose (see the
    ALLOWED entries below for the shape of a real exception, e.g. Void
    needs to find and act on non-canonical records themselves), add an
    entry here with a comment explaining why, the same way the existing
    ones are documented.
"""
import pathlib
import re

APP_ROOT = pathlib.Path(__file__).resolve().parent.parent / "app"

# A handover filtered by shift_id AND attendant_id together, joined by
# "and" in the same boolean expression - the exact "find the handover(s)
# for this pair" idiom that should go through handover_lookup.py.
_PATTERN = re.compile(
    r'\w+\.get\("shift_id"\)\s*==\s*[\w\.\[\]"]+\s+and\s+\w+\.get\("attendant_id"\)\s*==\s*[\w\.\[\]"]+'
    r'|'
    r'\w+\.get\("attendant_id"\)\s*==\s*[\w\.\[\]"]+\s+and\s+\w+\.get\("shift_id"\)\s*==\s*[\w\.\[\]"]+'
)

# Files entirely exempt (the canonical-access module itself defines this
# lookup - it's supposed to contain it).
_EXEMPT_FILES = {"handover_lookup.py"}

# {relative_path: allowed_match_count} for deliberate, reviewed exceptions.
# Each entry needs a reason in the comment above it. If this count doesn't
# match what's found, the test fails either way - so a fixed instance must
# also have its allowance removed here, not just left stale.
_ALLOWED = {
    # void_handover / unvoid_handover / delete_voided_handover: these three
    # owner-only actions intentionally operate on non-canonical (voided,
    # superseded, returned) handovers themselves - that's the whole point
    # of Void, so they must bypass the canonical filter on purpose rather
    # than being migrated to it.
    "api/v1/attendant_handover.py": 3,
}


def _relative_matches():
    found = {}
    for path in sorted(APP_ROOT.rglob("*.py")):
        if path.name in _EXEMPT_FILES:
            continue
        text = path.read_text(encoding="utf-8")
        matches = _PATTERN.findall(text)
        if matches:
            rel = str(path.relative_to(APP_ROOT)).replace("\\", "/")
            found[rel] = len(matches)
    return found


def test_no_new_hand_rolled_shift_attendant_handover_filters():
    found = _relative_matches()
    unexpected = {}
    for rel, count in found.items():
        allowed = _ALLOWED.get(rel, 0)
        if count != allowed:
            unexpected[rel] = (count, allowed)

    # A file that used to need an allowance but no longer matches at all
    # would just be absent from `found` - that's fine, it means it was
    # migrated onto handover_lookup.py and the allowance should be deleted
    # above (a stale allowance for a file with zero real matches doesn't
    # fail this test, but drifts from being accurate documentation).
    assert not unexpected, (
        "Found a hand-rolled shift_id+attendant_id handover filter outside "
        "handover_lookup.py that isn't in the explicit ALLOWED list "
        f"(file: found_count, allowed_count): {unexpected}. "
        "Route it through get_canonical_handover/get_active_handover instead, "
        "or add a justified entry to ALLOWED in this test if it's a "
        "deliberate exception like Void."
    )
