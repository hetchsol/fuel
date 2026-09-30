"""
Tests for the canonical-access layer (handover_lookup.py).

This module is the single place allowed to answer "what's the real, current
handover/reading for this attendant on this shift" — these tests lock in
that a superseded or voided record is never treated as canonical, and that
a legacy record with no lineage fields at all (written before this module
existed) is still treated as canonical, not silently excluded.
"""
from app.services.handover_lookup import (
    apply_resubmission_lineage,
    find_duplicate_handover_groups,
    get_canonical_handover,
    get_canonical_nozzle_summaries,
    get_most_recent_handover,
    get_nozzle_current_reading,
    is_handover_canonical,
    is_reading_current,
)


def test_submitted_and_approved_are_canonical():
    assert is_handover_canonical({"review_status": "submitted"}) is True
    assert is_handover_canonical({"review_status": "flagged"}) is True
    assert is_handover_canonical({"review_status": "approved"}) is True
    assert is_handover_canonical({"review_status": "returned"}) is True


def test_voided_and_superseded_are_not_canonical():
    assert is_handover_canonical({"review_status": "voided"}) is False
    assert is_handover_canonical({"review_status": "superseded"}) is False


def test_superseded_by_makes_a_record_non_canonical_regardless_of_status():
    # An approved record that a later attempt superseded should never happen
    # once write-time enforcement lands, but the read side must not trust
    # review_status alone if superseded_by somehow got set.
    assert is_handover_canonical({"review_status": "approved", "superseded_by": "HO-2"}) is False


def test_legacy_record_with_no_lineage_fields_is_canonical():
    # Written before supersedes/superseded_by existed - must not be treated
    # as missing/invalid just because the new fields are absent.
    assert is_handover_canonical({}) is True


def test_none_is_not_canonical():
    assert is_handover_canonical(None) is False


def _handovers_fixture():
    return {
        "HO-1": {
            "shift_id": "S1", "attendant_id": "A1", "review_status": "submitted",
            "created_at": "2026-01-01T08:00:00", "superseded_by": "HO-2",
            "nozzle_summaries": ["old"],
        },
        "HO-2": {
            "shift_id": "S1", "attendant_id": "A1", "review_status": "approved",
            "created_at": "2026-01-01T09:00:00", "supersedes": "HO-1",
            "nozzle_summaries": ["new"],
        },
        "HO-3": {
            "shift_id": "S1", "attendant_id": "A2", "review_status": "submitted",
            "created_at": "2026-01-01T08:30:00", "nozzle_summaries": ["other-attendant"],
        },
    }


def test_get_canonical_handover_skips_superseded_and_returns_the_replacement():
    handovers = _handovers_fixture()
    result = get_canonical_handover("ST_TEST", "S1", "A1", handovers=handovers)
    assert result is handovers["HO-2"]


def test_get_canonical_handover_does_not_cross_attendants():
    handovers = _handovers_fixture()
    result = get_canonical_handover("ST_TEST", "S1", "A2", handovers=handovers)
    assert result is handovers["HO-3"]


def test_get_canonical_handover_returns_none_when_nothing_matches():
    handovers = _handovers_fixture()
    assert get_canonical_handover("ST_TEST", "S1", "NOBODY", handovers=handovers) is None


def test_get_canonical_handover_returns_none_when_only_voided_attempt_exists():
    handovers = {
        "HO-1": {"shift_id": "S9", "attendant_id": "A9", "review_status": "voided",
                  "created_at": "2026-01-01T08:00:00"},
    }
    assert get_canonical_handover("ST_TEST", "S9", "A9", handovers=handovers) is None


def test_get_canonical_nozzle_summaries_reads_through_to_the_canonical_handover():
    handovers = _handovers_fixture()
    assert get_canonical_nozzle_summaries("ST_TEST", "S1", "A1", handovers=handovers) == ["new"]


def test_get_canonical_nozzle_summaries_empty_when_no_canonical_handover():
    assert get_canonical_nozzle_summaries("ST_TEST", "S1", "NOBODY", handovers={}) == []


def test_is_reading_current_excludes_voided_superseded_and_excluded():
    assert is_reading_current({"voided": True}) is False
    assert is_reading_current({"superseded": True}) is False
    assert is_reading_current({"excluded_from_checks": True}) is False


def test_is_reading_current_true_for_a_plain_record():
    assert is_reading_current({"reading_type": "Closing", "electronic_reading": 100.0}) is True


def test_is_reading_current_false_for_missing_record():
    assert is_reading_current(None) is False


def _storage_with_nozzle(nozzle: dict) -> dict:
    return {"islands": {"I1": {"pump_station": {"nozzles": [nozzle]}}}}


def test_get_nozzle_current_reading_falls_back_to_flat_fields_when_no_ledger():
    storage = _storage_with_nozzle(
        {"nozzle_id": "N1", "electronic_reading": 100.0, "mechanical_reading": 99.5}
    )
    result = get_nozzle_current_reading("N1", storage)
    assert result == {
        "electronic_reading": 100.0,
        "mechanical_reading": 99.5,
        "source_handover_id": None,
    }


def test_get_nozzle_current_reading_uses_latest_non_superseded_ledger_entry():
    storage = _storage_with_nozzle({
        "nozzle_id": "N2",
        # Stale flat fields left behind by a pre-migration write - the
        # ledger, once present, must win over these.
        "electronic_reading": 999.0,
        "mechanical_reading": 999.0,
        "reading_history": [
            {"electronic_reading": 50.0, "mechanical_reading": 49.0,
             "source_handover_id": "HO-a", "recorded_at": "t1", "superseded": True},
            {"electronic_reading": 60.0, "mechanical_reading": 59.0,
             "source_handover_id": "HO-b", "recorded_at": "t2", "superseded": False},
        ],
    })
    result = get_nozzle_current_reading("N2", storage)
    assert result == {
        "electronic_reading": 60.0,
        "mechanical_reading": 59.0,
        "source_handover_id": "HO-b",
    }


def test_get_nozzle_current_reading_returns_none_for_unknown_nozzle():
    storage = _storage_with_nozzle({"nozzle_id": "N1", "electronic_reading": 1.0})
    assert get_nozzle_current_reading("DOES-NOT-EXIST", storage) is None


def test_find_duplicate_handover_groups_no_duplicates():
    handovers = {
        "HO-1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
        "HO-2": {"shift_id": "S2", "attendant_id": "A2", "review_status": "submitted"},
    }
    result = find_duplicate_handover_groups(handovers)
    assert result == {"unambiguous": [], "ambiguous": []}


def test_find_duplicate_handover_groups_classifies_one_approved_plus_orphan_as_unambiguous():
    handovers = {
        "HO-APPROVED": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
        "HO-ORPHAN": {"shift_id": "S1", "attendant_id": "A1", "review_status": "returned"},
    }
    result = find_duplicate_handover_groups(handovers)
    assert result["ambiguous"] == []
    assert len(result["unambiguous"]) == 1
    entry = result["unambiguous"][0]
    assert entry["shift_id"] == "S1"
    assert entry["attendant_id"] == "A1"
    assert entry["keep_handover_id"] == "HO-APPROVED"
    assert set(entry["handover_ids"]) == {"HO-APPROVED", "HO-ORPHAN"}


def test_find_duplicate_handover_groups_two_approved_is_ambiguous():
    handovers = {
        "HO-1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
        "HO-2": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
    }
    result = find_duplicate_handover_groups(handovers)
    assert result["unambiguous"] == []
    assert len(result["ambiguous"]) == 1


def test_find_duplicate_handover_groups_ignores_voided_entries():
    handovers = {
        "HO-1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
        "HO-2": {"shift_id": "S1", "attendant_id": "A1", "review_status": "voided"},
    }
    # Only one non-voided handover remains - not real duplicate backlog.
    result = find_duplicate_handover_groups(handovers)
    assert result == {"unambiguous": [], "ambiguous": []}


def test_get_most_recent_handover_picks_by_created_at_not_resolution_status():
    # A LATER, unresolved (returned) handover is the one whose data is
    # currently sitting in the shared AR-{shift}-{attendant}-C record
    # (every submission path overwrites that same key) - get_most_recent_handover
    # must return it even though an EARLIER handover for the pair is approved.
    # get_canonical_handover would return the opposite (prefers resolved),
    # which is correct for "whose figures are real" but wrong for "who wrote
    # this raw record".
    handovers = {
        "HO-EARLY": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved",
                      "created_at": "2026-08-24T10:08:55"},
        "HO-LATE": {"shift_id": "S1", "attendant_id": "A1", "review_status": "returned",
                     "created_at": "2026-08-24T19:23:18"},
    }
    assert get_most_recent_handover("ST_TEST", "S1", "A1", handovers=handovers) is handovers["HO-LATE"]
    # Confirm the two lookups genuinely disagree here - that's the point.
    assert get_canonical_handover("ST_TEST", "S1", "A1", handovers=handovers) is handovers["HO-EARLY"]


def test_get_most_recent_handover_returns_none_when_pair_has_no_handovers():
    assert get_most_recent_handover("ST_TEST", "S1", "NOBODY", handovers={}) is None


def test_apply_resubmission_lineage_supersede_marks_prior_and_links():
    handovers = {
        "HO-PRIOR": {"review_status": "returned", "attempt_number": 1},
    }
    resubmission = {"action": "supersede", "supersedes_id": "HO-PRIOR"}

    supersedes_id, attempt_number = apply_resubmission_lineage(handovers, resubmission, "HO-NEW")

    assert supersedes_id == "HO-PRIOR"
    assert attempt_number == 2
    assert handovers["HO-PRIOR"]["review_status"] == "superseded"
    assert handovers["HO-PRIOR"]["pre_superseded_review_status"] == "returned"
    assert handovers["HO-PRIOR"]["superseded_by"] == "HO-NEW"


def test_apply_resubmission_lineage_new_with_voided_predecessor_links_without_remarking():
    handovers = {
        "HO-VOIDED": {"review_status": "voided", "attempt_number": 1},
    }
    resubmission = {"action": "new", "supersedes_id": "HO-VOIDED"}

    supersedes_id, attempt_number = apply_resubmission_lineage(handovers, resubmission, "HO-NEW")

    assert supersedes_id == "HO-VOIDED"
    assert attempt_number == 2
    # Voided is already terminal - must not be relabeled or linked.
    assert handovers["HO-VOIDED"]["review_status"] == "voided"
    assert "superseded_by" not in handovers["HO-VOIDED"]


def test_apply_resubmission_lineage_no_predecessor_is_attempt_one():
    supersedes_id, attempt_number = apply_resubmission_lineage({}, {"action": "new", "supersedes_id": None}, "HO-NEW")
    assert supersedes_id is None
    assert attempt_number == 1
