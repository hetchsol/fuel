"""
Unit tests for the pure classification logic in audit_duplicate_handovers.py
(the Phase 5 backfill script) - group_by_pair and classify. These run
without any network access; the script itself is a CLI tool meant to be
run against production by hand, but the decision logic that determines
what gets auto-backfilled vs. left for manual review must be exactly
right, so it's covered here independent of the HTTP glue.
"""
import importlib.util
import pathlib

_SCRIPT_PATH = pathlib.Path(__file__).resolve().parent.parent / "audit_duplicate_handovers.py"
_spec = importlib.util.spec_from_file_location("audit_duplicate_handovers", _SCRIPT_PATH)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)


def _h(handover_id, shift_id, attendant_id, review_status, created_at="2026-01-01T00:00:00"):
    return {"handover_id": handover_id, "shift_id": shift_id, "attendant_id": attendant_id,
            "review_status": review_status, "created_at": created_at}


def test_group_by_pair_groups_correctly_and_skips_missing_ids():
    handovers = [
        _h("HO-1", "S1", "A1", "approved"),
        _h("HO-2", "S1", "A1", "returned"),
        _h("HO-3", "S1", "A2", "approved"),
        {"handover_id": "HO-4", "shift_id": None, "attendant_id": "A1", "review_status": "submitted"},
    ]
    groups = audit.group_by_pair(handovers)
    assert set(groups.keys()) == {("S1", "A1"), ("S1", "A2")}
    assert len(groups[("S1", "A1")]) == 2
    assert len(groups[("S1", "A2")]) == 1


def test_classify_the_real_sharon_case_is_unambiguous():
    group = [
        _h("HO-APPROVED", "S1", "A1", "approved", "2026-08-24T10:08:55"),
        _h("HO-DUPLICATE", "S1", "A1", "returned", "2026-08-24T19:23:18"),
    ]
    verdict, keep_id, supersede_ids = audit.classify(group)
    assert verdict == "unambiguous"
    assert keep_id == "HO-APPROVED"
    assert supersede_ids == ["HO-DUPLICATE"]


def test_classify_ignores_voided_entries_entirely():
    group = [
        _h("HO-1", "S1", "A1", "approved"),
        _h("HO-2", "S1", "A1", "voided"),
    ]
    # Only one NON-voided handover remains once the voided one is excluded -
    # this isn't real backlog, nothing to backfill.
    verdict, keep_id, supersede_ids = audit.classify(group)
    assert verdict == "unambiguous"
    assert keep_id is None
    assert supersede_ids == []


def test_classify_no_approved_handover_is_ambiguous():
    group = [
        _h("HO-1", "S1", "A1", "submitted"),
        _h("HO-2", "S1", "A1", "returned"),
    ]
    verdict, keep_id, supersede_ids = audit.classify(group)
    assert verdict == "ambiguous"
    assert keep_id is None
    assert supersede_ids == []


def test_classify_two_approved_is_ambiguous_never_auto_resolved():
    group = [
        _h("HO-1", "S1", "A1", "approved"),
        _h("HO-2", "S1", "A1", "approved"),
    ]
    verdict, keep_id, supersede_ids = audit.classify(group)
    assert verdict == "ambiguous"
    assert keep_id is None
    assert supersede_ids == []


def test_classify_multiple_orphans_around_one_approved_is_unambiguous():
    group = [
        _h("HO-1", "S1", "A1", "submitted"),
        _h("HO-2", "S1", "A1", "approved"),
        _h("HO-3", "S1", "A1", "returned"),
    ]
    verdict, keep_id, supersede_ids = audit.classify(group)
    assert verdict == "unambiguous"
    assert keep_id == "HO-2"
    assert set(supersede_ids) == {"HO-1", "HO-3"}
