#!/usr/bin/env python3
"""
Utility script to purge all test data from the PostgreSQL database
(teams, students, submissions, approvals, tickets, non-admin users)
to start completely fresh with real users.

Usage:
  python purge_railway_db.py
  python purge_railway_db.py --url "postgresql://postgres:password@host:port/railway"
"""

import os
import sys
import argparse
import psycopg2

ADMIN_EMAIL = "admin@ntic.org.gh"
ADMIN_ID = "USR-000"

TABLES_TO_PURGE = [
    "assignment_submissions",
    "students",
    "teams",
    "pending_approvals",
    "approved_approvals",
    "rejected_approvals",
    "support_tickets",
    "audit_logs",
    "lms_submissions",
    "lms_enrollments",
    "auth_sessions"
]


def purge_database(db_url: str):
    print(f"Connecting to database...")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        print("Purging test tables (CASCADE)...")
        for table in TABLES_TO_PURGE:
            try:
                cur.execute(f"TRUNCATE TABLE {table} CASCADE;")
                print(f"  ✓ Truncated {table}")
            except Exception as e:
                print(f"  ⚠ Note on {table}: {e}")

        print("Removing non-admin user accounts...")
        cur.execute("DELETE FROM users WHERE id != %s AND email != %s", (ADMIN_ID, ADMIN_EMAIL))
        print(f"  ✓ Preserved super-admin ({ADMIN_EMAIL})")

        conn.commit()
        cur.close()
        conn.close()
        print("\n✅ Database successfully cleared! Ready for real users.")
    except Exception as e:
        print(f"\n❌ Error connecting to database: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge test records from PostgreSQL.")
    parser.add_argument("--url", help="PostgreSQL connection string (defaults to DATABASE_URL env var)", default=os.getenv("DATABASE_URL", ""))
    args = parser.parse_args()

    url = args.url
    if not url:
        print("Error: No database URL provided. Pass --url '<postgresql_url>' or set DATABASE_URL.")
        sys.exit(1)

    purge_database(url)
