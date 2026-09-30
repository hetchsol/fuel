"""
Tests for shift_status.py's per-attendant resolution going through
get_canonical_handover (Phase 3 of the duplicate-handover remediation).

Before this, _shift_fully_approved / describe_unresolved_attendants picked
the MOST RECENT handover per attendant (or, worse, blocked on ANY unresolved
handover for the whole shift) rather than the resolved one - so a stray
orphan duplicate (created after an attendant's real handover was already
approved) could silently mask that approval and leave the shift, and the
whole day, stuck. These tests lock in the fix.
"""
from app.services import shift_status


def _patch_handovers(monkeypatch, handovers):
    monkeypatch.setattr(shift_status, "load_station_json",
                         lambda sid, fn, default=None: handovers)


def test_later_orphan_does_not_mask_an_earlier_approved_handover(monkeypatch):
    # This is the exact bug found live: attendant has an approved handover,
    # then a later (accidental) resubmission lands as "returned" - the
    # shift must still be recognized as fully approved for this attendant.
    handovers = {
        "HO-EARLY": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved",
                      "phase": "completed", "created_at": "2026-08-24T10:08:55"},
        "HO-LATE": {"shift_id": "S1", "attendant_id": "A1", "review_status": "returned",
                     "phase": "completed", "created_at": "2026-08-24T19:23:18"},
    }
    _patch_handovers(monkeypatch, handovers)
    shift = {"assignments": [{"attendant_id": "A1", "attendant_name": "Sharon"}]}

    assert shift_status._shift_fully_approved(shift, "S1", "ST001", {}) is True
    assert shift_status.describe_unresolved_attendants(shift, "S1", "ST001", {}) == []


def test_unresolved_orphan_alone_still_blocks(monkeypatch):
    # Sanity check the opposite direction: if the CANONICAL (most recent,
    # not-superseded) handover is itself unresolved, it must still block.
    handovers = {
        "HO-EARLY": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved",
                      "phase": "completed", "created_at": "2026-08-24T10:08:55",
                      "superseded_by": "HO-LATE"},
        "HO-LATE": {"shift_id": "S1", "attendant_id": "A1", "review_status": "submitted",
                     "phase": "readings_verified", "created_at": "2026-08-24T19:23:18",
                     "supersedes": "HO-EARLY"},
    }
    _patch_handovers(monkeypatch, handovers)
    shift = {"assignments": [{"attendant_id": "A1", "attendant_name": "Sharon"}]}

    assert shift_status._shift_fully_approved(shift, "S1", "ST001", {}) is False
    blockers = shift_status.describe_unresolved_attendants(shift, "S1", "ST001", {})
    assert len(blockers) == 1
    assert "Sharon" in blockers[0]


def test_voided_handover_still_counts_as_resolved(monkeypatch):
    handovers = {
        "HO-1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "voided",
                  "phase": "completed", "created_at": "2026-08-24T10:00:00"},
    }
    _patch_handovers(monkeypatch, handovers)
    shift = {"assignments": [{"attendant_id": "A1", "attendant_name": "Sharon"}]}

    assert shift_status._shift_fully_approved(shift, "S1", "ST001", {}) is True
    assert shift_status.describe_unresolved_attendants(shift, "S1", "ST001", {}) == []


def test_legacy_readings_superseded_phase_marker_is_still_excluded(monkeypatch):
    # Old-style redo-readings record: phase says superseded but review_status
    # was never touched (predates mark_superseded). Must not count as
    # blocking, and must not be picked over a real resolved handover.
    handovers = {
        "HO-OLD": {"shift_id": "S1", "attendant_id": "A1", "review_status": "submitted",
                    "phase": "readings_superseded", "created_at": "2026-08-24T09:00:00"},
        "HO-NEW": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved",
                    "phase": "completed", "created_at": "2026-08-24T10:00:00"},
    }
    _patch_handovers(monkeypatch, handovers)
    shift = {"assignments": [{"attendant_id": "A1", "attendant_name": "Sharon"}]}

    assert shift_status._shift_fully_approved(shift, "S1", "ST001", {}) is True


def test_no_assignments_fallback_ignores_missing_attendant_id(monkeypatch):
    # Regression guard: the no-assignments fallback must not require
    # attendant_id to be populated (some historical/legacy handovers omit it).
    handovers = {
        "a": {"shift_id": "S", "review_status": "approved"},
        "b": {"shift_id": "S", "review_status": "approved"},
    }
    _patch_handovers(monkeypatch, handovers)
    shift = {"status": "active"}

    assert shift_status._shift_fully_approved(shift, "S", "ST", {}) is True


def test_co_attendant_unresolved_still_blocks_the_whole_shift(monkeypatch):
    handovers = {
        "HO-A": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved",
                  "phase": "completed", "created_at": "2026-08-24T10:00:00"},
        "HO-B": {"shift_id": "S1", "attendant_id": "A2", "review_status": "flagged",
                  "phase": "completed", "created_at": "2026-08-24T10:00:00"},
    }
    _patch_handovers(monkeypatch, handovers)
    shift = {"assignments": [
        {"attendant_id": "A1", "attendant_name": "Sharon"},
        {"attendant_id": "A2", "attendant_name": "Bwalya"},
    ]}

    assert shift_status._shift_fully_approved(shift, "S1", "ST001", {}) is False
    blockers = shift_status.describe_unresolved_attendants(shift, "S1", "ST001", {})
    assert len(blockers) == 1
    assert "Bwalya" in blockers[0]
