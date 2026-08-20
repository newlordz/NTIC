"""Single source of truth for a competition cycle's lifecycle.

A "cycle" is not a separate entity: one row in ``competitions`` *is* one cycle.
This module owns the only legal set of statuses and the only legal transitions
between them, so the API and every panel in the UI agree on what a cycle's
state means.

Keep this in step with the frontend copy in
``NticPlatform.Frontend/src/app/services/competition-lifecycle.ts``. The two are
deliberately mirror images; if you add a status or a transition in one, add it
to the other in the same commit.

Before this existed the column was a bare ``VARCHAR(50)`` with no validation and
the only status logic anywhere was a hard-coded deny-list that also recognised a
``cancelled`` status the frontend had never heard of. Anything could be written
to the column, and the frontend silently relabelled whatever it did not
recognise as ``archived`` -- so one typo removed a live cycle from every panel.
"""

from typing import Dict, FrozenSet, Optional, Tuple

STATUS_DRAFT = "draft"
STATUS_REGISTRATION = "registration"
STATUS_ACTIVE = "active"
STATUS_COMPLETED = "completed"
STATUS_ARCHIVED = "archived"

#: Every legal cycle status, in lifecycle order.
CYCLE_STATUSES: Tuple[str, ...] = (
    STATUS_DRAFT,
    STATUS_REGISTRATION,
    STATUS_ACTIVE,
    STATUS_COMPLETED,
    STATUS_ARCHIVED,
)

#: Legal transitions keyed by current status.
#:
#: ``archived`` is terminal and reachable from every other state, because
#: withdrawing a cycle has to be possible at any point. ``registration`` may fall
#: back to ``draft`` so an admin can correct a cycle opened prematurely; no other
#: backwards move is allowed, because entrants may already have acted on it.
CYCLE_TRANSITIONS: Dict[str, FrozenSet[str]] = {
    STATUS_DRAFT: frozenset({STATUS_REGISTRATION, STATUS_ARCHIVED}),
    STATUS_REGISTRATION: frozenset({STATUS_ACTIVE, STATUS_DRAFT, STATUS_ARCHIVED}),
    STATUS_ACTIVE: frozenset({STATUS_COMPLETED, STATUS_ARCHIVED}),
    STATUS_COMPLETED: frozenset({STATUS_ARCHIVED}),
    STATUS_ARCHIVED: frozenset(),
}

#: Statuses in which a student may join a cycle.
REGISTRATION_OPEN_STATUSES: FrozenSet[str] = frozenset({STATUS_REGISTRATION, STATUS_ACTIVE})

#: Statuses an unauthenticated visitor is allowed to see.
PUBLICLY_VISIBLE_STATUSES: FrozenSet[str] = frozenset(
    {STATUS_REGISTRATION, STATUS_ACTIVE, STATUS_COMPLETED}
)

#: Status a newly created cycle gets when the client does not specify one.
#: Deliberately ``draft``: creating a cycle must never immediately expose it to
#: entrants. The column default used to be ``active``, so a create call that
#: omitted the field published the cycle instantly.
DEFAULT_STATUS = STATUS_DRAFT


def parse_status(value: Optional[str]) -> Optional[str]:
    """Normalise a status string, or return ``None`` if it is not a legal status.

    Never guesses. Callers decide how to handle an unknown value; nothing may
    quietly relabel it.
    """
    if not isinstance(value, str):
        return None
    normalised = value.strip().lower()
    return normalised if normalised in CYCLE_STATUSES else None


def can_transition(from_status: str, to_status: str) -> bool:
    return to_status in CYCLE_TRANSITIONS.get(from_status, frozenset())


def is_registration_open(status: Optional[str]) -> bool:
    return parse_status(status) in REGISTRATION_OPEN_STATUSES


def is_publicly_visible(status: Optional[str]) -> bool:
    return parse_status(status) in PUBLICLY_VISIBLE_STATUSES
