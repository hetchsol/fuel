"""
Canonical-access layer for handover and nozzle-reading data.

The rest of the codebase should never filter attendant_handovers.json or
attendant_readings.json by (shift_id, attendant_id) directly — every place
that did so ended up with its own slightly-wrong idea of what counts as
"current" (e.g. the duplicate-reading gate excluded voided records but
forgot returned ones; shift completion picked the newest handover instead
of the resolved one; the tank-vs-nozzle variance check had no exclusion at
all). This module is the one place that answers "what's the real,
current data for this attendant on this shift", so a new consumer written
later inherits correct behavior instead of re-deriving its own rules.

A handover is CANONICAL when it is the tip of its supersession chain and
hasn't been voided:
  - review_status not in ("voided", "superseded")
  - superseded_by not set

Everything else — an auto-superseded duplicate, a voided entry, a stray
orphan left over from a resubmission before this module existed — is
history, not current state, and must not feed into flags, shift
completion, or shift-wide reconciliation.

See the shift/handover duplicate-flag remediation plan for the full
rationale (Parts 1-4, 3a/3b).
"""
from typing import Optional

from ..database.station_files import load_station_json

HANDOVERS_FILE = "attendant_handovers.json"
READINGS_FILE = "attendant_readings.json"

_NON_CANONICAL_STATUSES = ("voided", "superseded")


def _nozzle_summary_field(ns, field):
    """Read a field off a nozzle summary that may be a Pydantic object or a plain dict."""
    return ns.get(field) if isinstance(ns, dict) else getattr(ns, field, None)


def is_handover_canonical(handover: dict) -> bool:
    """
    True if this handover record is the current, authoritative one for its
    (shift_id, attendant_id) pair — not voided, not superseded by a later
    attempt.

    Records written before the supersession-lineage fields existed simply
    have `superseded_by` absent, which correctly reads as "not superseded":
    historically there was never more than one live handover per pair for
    this check to distinguish.

    Also excludes the legacy phase == "readings_superseded" marker that
    redo_readings set before it started also setting review_status
    (see mark_superseded) — without this, an old pre-close redo would still
    read as canonical here even though it's exactly what this check exists
    to exclude.
    """
    if handover is None:
        return False
    if handover.get("review_status") in _NON_CANONICAL_STATUSES:
        return False
    if handover.get("superseded_by"):
        return False
    if handover.get("phase") == "readings_superseded":
        return False
    return True


def _pick_best(candidates: list) -> Optional[dict]:
    """
    Among same-(shift_id, attendant_id) handover candidates that have
    already passed whatever exclusion filter the caller applied, prefer a
    resolved one (approved/voided) over an unresolved one, rather than
    picking whichever is most recent.

    Once write-time enforcement (Part 2) is in place, callers will only
    ever pass in a single candidate. Until then - historical data from
    before that enforcement existed, not yet covered by the Phase 5
    backfill - more than one can still exist (e.g. an approved handover
    plus a later accidental resubmission that was manually returned, with
    neither explicitly linked as superseding the other). Preferring the
    resolved one here is what fixes the "later orphan silently masks an
    earlier approval" bug for that existing, un-backfilled data too, not
    only for submissions made after Phase 2 shipped. Ties within the same
    resolved-ness bucket fall back to most recent.
    """
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    resolved = [h for h in candidates if h.get("review_status") in ("approved", "voided")]
    pool = resolved or candidates
    return max(pool, key=lambda h: h.get("created_at", ""))


def get_canonical_handover(station_id: str, shift_id: str, attendant_id: str,
                            handovers: Optional[dict] = None) -> Optional[dict]:
    """
    The one handover whose data should be trusted as this attendant's
    current, live numbers for this shift - nozzle summaries, cash figures,
    the works. None if nothing qualifies (never submitted, or every attempt
    has since been voided/superseded).

    A voided handover is deliberately excluded here even though it's a
    legitimate resolved state - its numbers were reversed and must not be
    read back as real sales/reading data. For "is this attendant's
    situation resolved" (shift completion), use get_active_handover
    instead, which includes voided.

    Pass `handovers` when the caller already has attendant_handovers.json
    loaded in memory (e.g. mid-request, before it's saved back) to avoid a
    redundant read.
    """
    if handovers is None:
        handovers = load_station_json(station_id, HANDOVERS_FILE, default={})
    candidates = [
        h for h in handovers.values()
        if h.get("shift_id") == shift_id and h.get("attendant_id") == attendant_id
        and is_handover_canonical(h)
    ]
    return _pick_best(candidates)


def get_most_recent_handover(station_id: str, shift_id: str, attendant_id: str,
                              handovers: Optional[dict] = None) -> Optional[dict]:
    """
    Whichever handover for this (shift_id, attendant_id) pair was created
    last, regardless of review_status - i.e. whichever one actually wrote
    the current content of the shared AR-{shift_id}-{attendant_id}-O/C
    record, since every submission path overwrites that same key
    unconditionally (see submit_readings/submit_handover/manager_retro_entry).

    This is deliberately NOT get_canonical_handover: that function prefers a
    *resolved* candidate among several historical ones (right for "what are
    this attendant's real sales figures"), but the raw AR- record's content
    follows write order, not resolution status - an older, approved
    handover can sit alongside a newer, unresolved one whose data is what's
    actually in the shared slot right now. Use this whenever the question
    is "who wrote this raw reading record", not "whose figures should
    count as real".
    """
    if handovers is None:
        handovers = load_station_json(station_id, HANDOVERS_FILE, default={})
    pair = [
        h for h in handovers.values()
        if h.get("shift_id") == shift_id and h.get("attendant_id") == attendant_id
    ]
    if not pair:
        return None
    return max(pair, key=lambda h: h.get("created_at", ""))


def get_active_handover(station_id: str, shift_id: str, attendant_id: str,
                         handovers: Optional[dict] = None) -> Optional[dict]:
    """
    The one handover relevant to this attendant's resolution status for
    this shift - i.e. not explicitly superseded by a later attempt. Unlike
    get_canonical_handover, a VOIDED handover IS included here: it's a
    fully resolved terminal state for shift-completion purposes, just not
    something whose numbers should be treated as live data.

    Use this (not get_canonical_handover) for "has this attendant resolved
    their handover for this shift" checks - see shift_status.py.
    """
    if handovers is None:
        handovers = load_station_json(station_id, HANDOVERS_FILE, default={})
    candidates = [
        h for h in handovers.values()
        if h.get("shift_id") == shift_id and h.get("attendant_id") == attendant_id
        and not is_handover_superseded(h)
    ]
    return _pick_best(candidates)


def get_canonical_nozzle_summaries(station_id: str, shift_id: str, attendant_id: str,
                                    handovers: Optional[dict] = None) -> list:
    """The canonical handover's nozzle_summaries for this attendant+shift, or [] if none."""
    handover = get_canonical_handover(station_id, shift_id, attendant_id, handovers=handovers)
    if not handover:
        return []
    return handover.get("nozzle_summaries") or []


def is_reading_current(record: Optional[dict]) -> bool:
    """
    True if a raw attendant_readings.json record (an AR-{shift_id}-
    {attendant_id}-{O/C} entry) still represents real history that other
    shifts should be checked against — not voided, not superseded, and not
    manually excluded from checks.
    """
    if not record:
        return False
    if record.get("voided"):
        return False
    if record.get("superseded"):
        return False
    if record.get("excluded_from_checks"):
        return False
    return True


def is_handover_superseded(handover: dict) -> bool:
    """
    True if this handover has been explicitly replaced by a later attempt
    for the same (shift_id, attendant_id) pair.

    Unlike is_handover_canonical, this deliberately does NOT treat "voided"
    as excluded - a voided handover is a fully resolved terminal state for
    shift-completion purposes, just not "the" live data source. Checks
    three signals for backward compatibility: the current review_status
    value, the superseded_by link, and the legacy phase == "readings_superseded"
    marker that redo_readings set before it also started setting review_status.
    """
    if handover.get("review_status") == "superseded":
        return True
    if handover.get("superseded_by"):
        return True
    if handover.get("phase") == "readings_superseded":
        return True
    return False


def resolve_resubmission(handovers: dict, shift_id: str, attendant_id: str) -> dict:
    """
    Decide what should happen when a new submission comes in for a
    (shift_id, attendant_id) pair that may already have a handover.

    Returns one of:
      {"action": "new", "supersedes_id": <id> | None}
        No canonical handover currently exists for this pair (either never
        submitted, or every prior attempt is already voided/superseded).
        Safe to proceed as a fresh attempt. `supersedes_id`, when set,
        names the most recent prior attempt purely for audit-trail
        continuity (typically a voided record) - the caller should link
        the new handover's `supersedes` to it; the prior record itself
        needs no further mutation if it's voided (already terminal).

      {"action": "supersede", "supersedes_id": <id>}
        A canonical handover exists and is unresolved (submitted/flagged)
        or was returned by a supervisor. No structured "redo" flow exists
        for either case today, so it's safe to auto-supersede it rather
        than leaving an orphan sitting in the review queue forever. The
        caller should call mark_superseded() on the prior record and link
        the new handover's `supersedes` to it.

      {"action": "manual_redo_required", "prior_id": <id>}
        A canonical handover exists, is still pre-close
        (phase == "readings_verified"), and hasn't been reviewed yet. This
        is the one case with an existing, deliberate user-facing
        confirmation flow (POST /handover/redo-readings) - silently
        discarding readings the attendant may still be about to correct
        via the closing form would remove that safety check, so this stays
        a hard rejection rather than an automatic supersede.

      {"action": "reject", "prior_id": <id>, "reject_reason": <str>}
        A canonical handover exists and is already approved. Refuse the
        new submission outright - voiding the existing one first is the
        only sanctioned way to redo an approved shift (see /handover/void).
    """
    pair = [
        (hid, h) for hid, h in handovers.items()
        if h.get("shift_id") == shift_id and h.get("attendant_id") == attendant_id
    ]
    if not pair:
        return {"action": "new", "supersedes_id": None}

    canonical_id, canonical = next(
        ((hid, h) for hid, h in pair if is_handover_canonical(h)), (None, None)
    )

    if canonical is None:
        most_recent_id, _ = max(pair, key=lambda item: item[1].get("created_at", ""))
        return {"action": "new", "supersedes_id": most_recent_id}

    review_status = canonical.get("review_status", "submitted")
    if review_status == "approved":
        return {
            "action": "reject",
            "prior_id": canonical_id,
            "reject_reason": (
                f"This shift already has an approved handover ({canonical_id}) for this "
                "attendant. Void it first if it needs to be redone."
            ),
        }
    if canonical.get("phase") == "readings_verified":
        return {"action": "manual_redo_required", "prior_id": canonical_id}
    return {"action": "supersede", "supersedes_id": canonical_id}


def mark_superseded(handover: dict) -> None:
    """
    Mutate `handover` in place to record that it's no longer canonical,
    preserving whatever review_status it had beforehand. Idempotent - safe
    to call on a record that's already superseded.
    """
    if handover.get("review_status") == "superseded":
        return
    handover["pre_superseded_review_status"] = handover.get("review_status", "submitted")
    handover["review_status"] = "superseded"


_UNTRUSTWORTHY_FOR_HISTORY_STATUSES = ("voided", "superseded", "returned")


def is_handover_reading_trustworthy(handover: Optional[dict]) -> bool:
    """
    True if this handover's own submitted readings should still be trusted
    as real history when checking a DIFFERENT shift for a cross-shift
    duplicate/decreasing reading.

    Stricter than is_handover_canonical: a "returned" handover is still
    canonical (it's the one blocking ITS OWN shift from completing until
    corrected), but a supervisor has already flagged its numbers as wrong,
    so another, unrelated shift must not be compared against them as if
    they were confirmed ground truth. This was a real gap - the duplicate-
    reading gate previously excluded only voided records, so a returned
    duplicate's bad reading stayed in the comparison pool indefinitely,
    tripping false "duplicate_meter_reading" flags on later shifts until
    an owner specifically voided it.

    `handover=None` (no handover record found for this reading, e.g. data
    written before handover tracking existed) is treated as trustworthy -
    there's nothing indicating a problem, so this preserves prior behavior
    rather than guessing.
    """
    if handover is None:
        return True
    return handover.get("review_status") not in _UNTRUSTWORTHY_FOR_HISTORY_STATUSES


def find_duplicate_handover_groups(handovers: dict) -> dict:
    """
    Group handovers by (shift_id, attendant_id) and flag every pair with
    more than one non-voided entry - the shape of backlog Phase 5's
    backfill_supersede endpoint and audit_duplicate_handovers.py script
    exist to clean up, and what a recurrence of the original bug would
    look like going forward if a new, un-migrated submission path is ever
    added without going through resolve_resubmission.

    Returns {"unambiguous": [...], "ambiguous": [...]}, each entry
    {shift_id, attendant_id, handover_ids, keep_handover_id (unambiguous
    only)}. "Unambiguous" mirrors the backfill script's own rule: exactly
    one non-voided handover is approved, so it's proposed as the keeper;
    everything else is "ambiguous" and never auto-resolved by anything
    that reads this - it's for a human to look at.

    Used for observability (a count on Handover Review), not for deciding
    anything automatically - nothing calls backfill_supersede based on
    this function's output without a human in the loop.
    """
    groups: dict = {}
    for hid, h in handovers.items():
        shift_id, attendant_id = h.get("shift_id"), h.get("attendant_id")
        if not shift_id or not attendant_id:
            continue
        groups.setdefault((shift_id, attendant_id), []).append((hid, h))

    unambiguous, ambiguous = [], []
    for (shift_id, attendant_id), pairs in groups.items():
        non_voided = [(hid, h) for hid, h in pairs if h.get("review_status") != "voided"]
        if len(non_voided) <= 1:
            continue
        approved = [(hid, h) for hid, h in non_voided if h.get("review_status") == "approved"]
        entry = {
            "shift_id": shift_id,
            "attendant_id": attendant_id,
            "handover_ids": [hid for hid, _ in non_voided],
        }
        if len(approved) == 1:
            entry["keep_handover_id"] = approved[0][0]
            unambiguous.append(entry)
        else:
            ambiguous.append(entry)

    return {"unambiguous": unambiguous, "ambiguous": ambiguous}


def apply_resubmission_lineage(handovers: dict, resubmission: dict, new_handover_id: str) -> tuple:
    """
    Shared by every submission endpoint (submit_readings, submit_handover,
    manager_retro_entry): given resolve_resubmission's decision, links the
    new handover to whatever it replaces (if anything) and retires the
    prior record when appropriate. Mutates `handovers` in place - the
    caller still needs to save it and construct/store the new handover
    itself, and log handover_auto_superseded when the returned
    supersedes_id is set and resubmission["action"] == "supersede".

    Returns (supersedes_id, attempt_number) for the caller to put on the
    new handover's own `supersedes`/`attempt_number` fields.

    This used to be copy-pasted near-identically at all three call sites -
    a future change to the supersession logic (e.g. also reversing partial
    stock/credit effects, or fixing an attempt_number edge case) only needs
    to happen here now, not in three places that can silently drift apart.
    """
    supersedes_id = resubmission.get("supersedes_id")
    attempt_number = 1
    if supersedes_id and supersedes_id in handovers:
        prior = handovers[supersedes_id]
        attempt_number = (prior.get("attempt_number") or 1) + 1
        if prior.get("review_status") != "voided":
            prior["superseded_by"] = new_handover_id
            if resubmission["action"] == "supersede":
                mark_superseded(prior)
    return supersedes_id, attempt_number


def get_nozzle_current_reading(nozzle_id: str, storage: dict) -> Optional[dict]:
    """
    The nozzle's current electronic/mechanical reading, for opening-reading
    carry-forward.

    Nozzle config doesn't carry a reading_history ledger yet (see
    NozzleReadingLedgerEntry in models.py) — until the write side is
    migrated to append to that ledger instead of overwriting
    electronic_reading/mechanical_reading directly, this falls back to
    reading those same flat fields every existing caller reads today, so
    switching a caller to use this function now is a behavior no-op. Once
    the ledger is populated, this becomes the only place that resolves
    "current" from its latest non-superseded entry, and every migrated
    caller benefits without further changes on their end.
    """
    from ..database.storage import get_nozzle

    nozzle = get_nozzle(nozzle_id, storage=storage)
    if not nozzle:
        return None

    ledger = nozzle.get("reading_history")
    if ledger:
        current = next((entry for entry in reversed(ledger) if not entry.get("superseded")), None)
        if current:
            return {
                "electronic_reading": current.get("electronic_reading"),
                "mechanical_reading": current.get("mechanical_reading"),
                "source_handover_id": current.get("source_handover_id"),
            }

    return {
        "electronic_reading": nozzle.get("electronic_reading"),
        "mechanical_reading": nozzle.get("mechanical_reading"),
        "source_handover_id": None,
    }
