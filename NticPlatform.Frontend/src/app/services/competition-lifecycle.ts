/**
 * Single source of truth for a competition cycle's lifecycle.
 *
 * A "cycle" is not a separate entity: one Competition row *is* one cycle. This
 * module owns the only legal set of statuses and the only legal transitions
 * between them, so that the admin panel, the public panel, the registration
 * page and the API all agree on what a cycle's state means.
 *
 * Keep this in step with the backend copy in NticPlatform.Backend/app/lifecycle.py.
 * The two files are deliberately mirror images; if you add a status or a
 * transition here, add it there in the same commit or the API will start
 * rejecting transitions the UI offers.
 *
 * Previously each panel hard-coded its own flow array and its own status list.
 * They drifted: `archived` was unreachable because the advance flow stopped at
 * `completed`, the backend additionally recognised a `cancelled` status that the
 * frontend had never heard of, and any status the frontend did not recognise was
 * silently rewritten to `archived` on load -- so a single typo server-side made
 * a live cycle vanish from every panel at once.
 */

export const CYCLE_STATUSES = ['draft', 'registration', 'active', 'completed', 'archived'] as const;

export type CycleStatus = typeof CYCLE_STATUSES[number];

/**
 * Legal transitions, keyed by current status.
 *
 * `archived` is terminal and reachable from every other state, because
 * withdrawing a cycle has to be possible at any point. Going back from
 * `registration` to `draft` is allowed so an admin can correct a cycle that was
 * opened prematurely; every other backwards move is not, because entrants may
 * already have acted on the cycle being open.
 */
export const CYCLE_TRANSITIONS: Readonly<Record<CycleStatus, readonly CycleStatus[]>> = {
  draft:        ['registration', 'archived'],
  registration: ['active', 'draft', 'archived'],
  active:       ['completed', 'archived'],
  completed:    ['archived'],
  archived:     []
};

/**
 * The single forward step the "advance" button offers, or null at the end of the
 * line. Archiving is deliberately excluded: it is destructive enough that it
 * should always be an explicit choice rather than the next click in a sequence.
 */
const CYCLE_ADVANCE: Readonly<Record<CycleStatus, CycleStatus | null>> = {
  draft:        'registration',
  registration: 'active',
  active:       'completed',
  completed:    null,
  archived:     null
};

/** Statuses in which a student may join a cycle. */
const REGISTRATION_OPEN: readonly CycleStatus[] = ['registration', 'active'];

/** Statuses an unauthenticated visitor is allowed to see. */
const PUBLICLY_VISIBLE: readonly CycleStatus[] = ['registration', 'active', 'completed'];

export function isCycleStatus(value: unknown): value is CycleStatus {
  return typeof value === 'string' && (CYCLE_STATUSES as readonly string[]).includes(value);
}

/**
 * Normalises a status coming from storage or the API.
 *
 * Returns null rather than guessing when the value is not recognised. Callers
 * decide what to do; nothing may quietly relabel an unknown status, which is
 * what used to turn typos into archived cycles.
 */
export function parseCycleStatus(value: unknown): CycleStatus | null {
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase();
  return isCycleStatus(normalised) ? normalised : null;
}

export function canTransition(from: CycleStatus, to: CycleStatus): boolean {
  return CYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextCycleStatus(from: CycleStatus): CycleStatus | null {
  return CYCLE_ADVANCE[from] ?? null;
}

export function isRegistrationOpen(status: CycleStatus): boolean {
  return REGISTRATION_OPEN.includes(status);
}

export function isPubliclyVisible(status: CycleStatus): boolean {
  return PUBLICLY_VISIBLE.includes(status);
}

/** Human-readable label for the advance action, for buttons. */
export function advanceLabel(from: CycleStatus): string {
  switch (nextCycleStatus(from)) {
    case 'registration': return 'Open Registration';
    case 'active':       return 'Activate';
    case 'completed':    return 'Mark Complete';
    default:             return '';
  }
}

/** Material icon for the advance action, for buttons. */
export function advanceIcon(from: CycleStatus): string {
  switch (nextCycleStatus(from)) {
    case 'registration': return 'how_to_reg';
    case 'active':       return 'play_circle';
    case 'completed':    return 'check_circle';
    default:             return '';
  }
}
