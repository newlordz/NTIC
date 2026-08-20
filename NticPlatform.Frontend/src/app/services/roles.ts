/**
 * Mirror of the backend's role model in NticPlatform.Backend/app/security.py.
 *
 * The API is the only real authority on permissions; this file exists so the UI
 * can gate routes and controls using the *same vocabulary*, instead of each
 * route hand-listing role strings. Hand-listing is how the two drifted: the
 * Cycle Manager route admitted school_admin, instructor, content_manager and
 * support_admin, none of which the competitions API accepts, so those roles
 * could open the panel and then got a 403 from every button on it.
 *
 * Keep the sets below in step with security.py. If you change a set there,
 * change it here in the same commit.
 */

export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_ADMIN = 'admin';
export const ROLE_SUPPORT_ADMIN = 'support_admin';
export const ROLE_CONTENT_MANAGER = 'content_manager';
export const ROLE_COMPETITION_MANAGER = 'competition_manager';
export const ROLE_REVIEWER = 'reviewer';
export const ROLE_JUDGE = 'judge';
export const ROLE_INSTRUCTOR = 'instructor';
export const ROLE_SCHOOL_ADMIN = 'school_admin';
export const ROLE_SPONSOR = 'sponsor';
export const ROLE_STUDENT = 'student';

/** security.py: ALL_ROLES */
export const ALL_ROLES = [
  ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SUPPORT_ADMIN, ROLE_CONTENT_MANAGER,
  ROLE_COMPETITION_MANAGER, ROLE_REVIEWER, ROLE_JUDGE, ROLE_INSTRUCTOR,
  ROLE_SCHOOL_ADMIN, ROLE_SPONSOR, ROLE_STUDENT
] as const;

export type AppRole = typeof ALL_ROLES[number];

const union = (...groups: readonly string[][]): string[] =>
  Array.from(new Set(groups.flat()));

/** security.py: ADMIN_ROLES */
export const ADMIN_ROLES = [ROLE_SUPER_ADMIN, ROLE_ADMIN];

/** security.py: CONTENT_ROLES -- may edit public site content. */
export const CONTENT_ROLES = union(ADMIN_ROLES, [ROLE_CONTENT_MANAGER]);

/** security.py: COMPETITION_ROLES -- may create/edit competition cycles. */
export const COMPETITION_ROLES = union(ADMIN_ROLES, [ROLE_COMPETITION_MANAGER]);

/** security.py: GRADING_ROLES -- may score submissions. */
export const GRADING_ROLES = union(ADMIN_ROLES, [ROLE_JUDGE, ROLE_REVIEWER, ROLE_INSTRUCTOR]);

/** security.py: APPROVAL_ROLES -- may approve or reject pending registrations. */
export const APPROVAL_ROLES = union(ADMIN_ROLES, [ROLE_REVIEWER, ROLE_COMPETITION_MANAGER]);

/** security.py: STUDENT_ADMIN_ROLES -- may manage student records. */
export const STUDENT_ADMIN_ROLES = union(ADMIN_ROLES, [ROLE_SCHOOL_ADMIN, ROLE_INSTRUCTOR]);

/** security.py: SUPPORT_ROLES -- may administer support tickets. */
export const SUPPORT_ROLES = union(ADMIN_ROLES, [ROLE_SUPPORT_ADMIN]);

/** security.py: LMS_ROLES -- may create and manage LMS courses and materials. */
export const LMS_ROLES = union(ADMIN_ROLES, [ROLE_INSTRUCTOR, ROLE_CONTENT_MANAGER]);

export { union as unionRoles };

/** True when `role` may perform an action governed by `roleSet`. */
export function hasRole(role: string | null | undefined, roleSet: readonly string[]): boolean {
  return !!role && roleSet.includes(role);
}

/** May this role create, edit or advance a competition cycle? */
export function canManageCycles(role: string | null | undefined): boolean {
  return hasRole(role, COMPETITION_ROLES);
}

/** May this role approve or reject a pending registration? */
export function canApproveRegistrations(role: string | null | undefined): boolean {
  return hasRole(role, APPROVAL_ROLES);
}
