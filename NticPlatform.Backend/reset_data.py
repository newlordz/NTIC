"""
Reset the database to a clean slate so real data can be entered.

This deletes all demo/placeholder content and transactional data, but keeps the
super-admin (and admin) accounts by default so you can still log in. It does NOT
touch the schema, and it leaves the editable landing-page copy in place.

Usage (from the backend directory):

    python reset_data.py --yes                 # wipe data, keep super_admin + admin
    python reset_data.py --yes --full          # also delete the admin accounts
    python reset_data.py --yes --with-audit    # also clear the audit log history

Safety: nothing is deleted without `--yes`. The list of tables is explicit.
"""
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import get_db_connection, release_db_connection  # noqa: E402


# Demo/transactional tables to empty. Ordered for clarity; the truncate below
# uses CASCADE so foreign-key references among them are handled together.
DATA_TABLES = [
    "competition_registrations",
    "team_members",
    "teams",
    "students",
    "lms_progress",
    "lms_submissions",
    "lms_enrollments",
    "lms_assignments",
    "lms_materials",
    "lms_modules",
    "lms_courses",
    "pending_approvals",
    "assignment_submissions",
    "sponsorship_payments",
    "sponsorships",
    "hof_entries",
    "schools",
    "events",
    "news_items",
    "stories",
    "philosophy_cards",
    "hero_slides",
    "talent_discovery",
    "csr_updates",
    "competitions",
    "auth_sessions",
    "otp_challenges",
    "rate_limit_hits",
    "registration_drafts",
    "support_tickets",
]

# Deliberately NOT cleared:
#   users          -> kept (super_admin/admin preserved; others deleted unless --full)
#   landing_copy   -> editable site copy, real content
#   platform_stats -> display aggregate, recomputed from live data


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset NTIC data to a clean slate.")
    parser.add_argument("--yes", action="store_true", help="Required to actually delete anything.")
    parser.add_argument("--full", action="store_true",
                        help="Also delete the admin/super-admin accounts (you will be locked out).")
    parser.add_argument("--with-audit", action="store_true",
                        help="Also clear the audit log history.")
    args = parser.parse_args()

    if not args.yes:
        print("Dry run: pass --yes to actually delete. Nothing was changed.")
        print(f"Would truncate {len(DATA_TABLES)} tables:")
        for t in DATA_TABLES:
            print(f"  - {t}")
        print("Users: delete all except super_admin/admin" + (" (including admin, --full)" if args.full else ""))
        return 0

    conn = get_db_connection()
    if not conn:
        print("Could not reach the database. Is it running? Check DATABASE_URL.")
        return 1

    try:
        cur = conn.cursor()

        tables = DATA_TABLES + (["audit_logs"] if args.with_audit else [])
        cur.execute("TRUNCATE TABLE " + ", ".join(tables) + " CASCADE")

        if args.full:
            cur.execute("DELETE FROM users")
            print("Deleted ALL user accounts (--full). Re-run the app to recreate the super-admin.")
        else:
            cur.execute("DELETE FROM users WHERE role NOT IN ('super_admin', 'admin')")
            print("Deleted all non-admin users; kept super_admin and admin accounts.")

        conn.commit()
        cur.close()
    finally:
        release_db_connection(conn)

    print("Reset complete. The schema is intact; enter real data via the UI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
