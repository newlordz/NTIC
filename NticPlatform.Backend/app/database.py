import logging
from app.config import settings
from app.seed import seed_initial_data

logger = logging.getLogger("ntic.db")


def _redact_db_url(url: str) -> str:
    """Return a connection URL safe to log — password replaced with ***.

    Falls back to a fully opaque marker if the URL cannot be parsed, so a
    malformed value can never leak its contents into the logs.
    """
    try:
        from urllib.parse import urlsplit

        parts = urlsplit(url)
        if not parts.hostname:
            return "<unparseable url redacted>"
        userinfo = ""
        if parts.username:
            userinfo = parts.username + (":***" if parts.password else "") + "@"
        port = f":{parts.port}" if parts.port else ""
        database = parts.path or ""
        return f"{parts.scheme}://{userinfo}{parts.hostname}{port}{database}"
    except Exception:
        return "<unparseable url redacted>"


def init_postgres_db():
    """Ensure NticPlatformDb database and schema exist."""
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    except ImportError:
        logger.warning("psycopg2 not installed yet. Run 'pip install -r requirements.txt'")
        return False, "psycopg2 not installed"

    import os

    # ── Diagnose available connection vars ──────────────────────────
    # Never log raw values: DATABASE_URL contains the password in the
    # "postgresql://user:PASSWORD@host/db" userinfo section.
    url_keys = {"DATABASE_PRIVATE_URL", "DATABASE_URL"}
    db_keys = ["DATABASE_PRIVATE_URL", "DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "POSTGRES_HOST", "POSTGRES_PORT"]
    for k in db_keys:
        v = os.environ.get(k, "")
        if not v:
            logger.info(f"  env {k} = (not set)")
        elif k in url_keys:
            logger.info(f"  env {k} = (set) {_redact_db_url(v)}")
        else:
            logger.info(f"  env {k} = {v}")

    # ── URL-based connection (works when env var is a real URL) ─────
    conn = get_db_connection()
    if conn:
        _create_tables(conn)
        conn.close()
        logger.info("Database connected and schema verified via URL-based connection.")
        return True, "OK"

    # ── local-dev fallback (will never work on Railway) ─────────────
    db_host = settings.POSTGRES_HOST
    if db_host in ("localhost", ""):
        db_host = "127.0.0.1"
    try:
        admin_conn = psycopg2.connect(
            host=db_host,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname="postgres",
            connect_timeout=10,
        )
        admin_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = admin_conn.cursor()
        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (settings.POSTGRES_DB,))
        if not cur.fetchone():
            logger.info(f"Creating PostgreSQL database: {settings.POSTGRES_DB}...")
            cur.execute(f'CREATE DATABASE "{settings.POSTGRES_DB}"')
        cur.close()
        admin_conn.close()
    except Exception as e:
        logger.warning(f"Note checking/creating database: {e}")

    conn = get_db_connection()
    if not conn:
        return False, "Could not connect to NticPlatformDb"
    _create_tables(conn)
    conn.close()
    logger.info(f"Successfully connected to PostgreSQL ({db_host}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}), created tables, and seeded initial data.")
    return True, "OK"


def _create_tables(conn):
    """Create all tables if they don't exist, then seed."""
    cur = conn.cursor()
    
    # Create tables
    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            email VARCHAR(150) UNIQUE NOT NULL,
            track VARCHAR(50),
            consent_granted BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS assignment_submissions (
            id VARCHAR(64) PRIMARY KEY,
            tenant_id VARCHAR(64) NOT NULL,
            student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
            source_code_path VARCHAR(500) NOT NULL,
            video_url VARCHAR(500),
            status VARCHAR(50) DEFAULT 'Pending',
            score INTEGER NULL,
            feedback TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS competitions (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            track VARCHAR(100),
            category VARCHAR(100),
            deadline VARCHAR(50),
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            comp_type VARCHAR(50) DEFAULT 'qualifier',
            max_teams INTEGER DEFAULT 50,
            teams INTEGER DEFAULT 0,
            prize VARCHAR(200) DEFAULT '',
            start_date VARCHAR(50) DEFAULT '',
            end_date VARCHAR(50) DEFAULT '',
            phases TEXT DEFAULT '[]',
            rules TEXT DEFAULT '',
            criteria TEXT DEFAULT '',
            progress INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS teams (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            track VARCHAR(100),
            lead VARCHAR(150),
            members INTEGER DEFAULT 1,
            status VARCHAR(50) DEFAULT 'Active',
            school_name VARCHAR(200)
        );

        CREATE TABLE IF NOT EXISTS events (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            date VARCHAR(50),
            time VARCHAR(50),
            location VARCHAR(150),
            description TEXT,
            type VARCHAR(50)
        );

        CREATE TABLE IF NOT EXISTS stories (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            excerpt TEXT,
            date VARCHAR(50),
            image VARCHAR(255),
            tag VARCHAR(64) DEFAULT '',
            tag_color VARCHAR(64) DEFAULT '',
            read_time VARCHAR(32) DEFAULT '5 min',
            likes INT DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS philosophy_cards (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(100) NOT NULL,
            description TEXT,
            image VARCHAR(255)
        );

        CREATE TABLE IF NOT EXISTS schools (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            region VARCHAR(100),
            teams INTEGER DEFAULT 0,
            score INTEGER DEFAULT 0,
            rank INTEGER,
            status VARCHAR(50) DEFAULT 'Active',
            coding_score INTEGER DEFAULT 0,
            robotics_score INTEGER DEFAULT 0,
            ai_score INTEGER DEFAULT 0,
            cyber_score INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            usr VARCHAR(150),
            time VARCHAR(50),
            type VARCHAR(50),
            ip VARCHAR(100) DEFAULT '',
            client TEXT DEFAULT ''
        );
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip VARCHAR(100) DEFAULT '';
        ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS client TEXT DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_audit_logs_id_desc ON audit_logs (id DESC);

        CREATE TABLE IF NOT EXISTS support_tickets (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(150) NOT NULL,
            user_name VARCHAR(200) NOT NULL,
            user_role VARCHAR(50) NOT NULL,
            user_email VARCHAR(150) NOT NULL,
            status VARCHAR(20) DEFAULT 'open',
            chat_history JSONB DEFAULT '[]',
            admin_replies JSONB DEFAULT '[]',
            is_deleted BOOLEAN DEFAULT false,
            deleted_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(150) UNIQUE NOT NULL,
            full_name VARCHAR(200),
            role VARCHAR(50) NOT NULL DEFAULT 'student',
            ticket VARCHAR(64),
            password_hash VARCHAR(255) NOT NULL,
            status VARCHAR(20) DEFAULT 'Active',
            phone VARCHAR(50) UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            token VARCHAR(128) PRIMARY KEY,
            user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
            email VARCHAR(150) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL
        );

        -- One-time verification codes. The code itself is NEVER stored, only a
        -- PBKDF2 hash, so a database leak does not expose in-flight codes.
        -- Verification happens server-side; the browser only ever holds the
        -- opaque challenge id.
        CREATE TABLE IF NOT EXISTS otp_challenges (
            id VARCHAR(64) PRIMARY KEY,
            purpose VARCHAR(40) NOT NULL,
            channel VARCHAR(16) NOT NULL,
            target VARCHAR(254) NOT NULL,
            code_hash TEXT NOT NULL,
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 5,
            consumed_at TIMESTAMP NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Shared rate-limit state. Previously this lived in a process-local
        -- dict, so with N replicas the effective login limit was 5*N and every
        -- deploy reset the counters. Postgres is already a shared dependency, so
        -- no extra infrastructure is needed.
        CREATE TABLE IF NOT EXISTS rate_limit_hits (
            bucket VARCHAR(200) NOT NULL,
            hit_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS hof_entries (
            id VARCHAR(64) PRIMARY KEY,
            type VARCHAR(20) DEFAULT 'individual',
            initials VARCHAR(10),
            name VARCHAR(200) NOT NULL,
            team_name VARCHAR(200),
            project_title TEXT,
            members JSONB DEFAULT '[]',
            school VARCHAR(200),
            year VARCHAR(10),
            badge VARCHAR(200),
            track_class VARCHAR(50),
            expiry_date VARCHAR(50)
        );

        CREATE TABLE IF NOT EXISTS news_items (
            id VARCHAR(64) PRIMARY KEY,
            headline VARCHAR(300) NOT NULL,
            tag VARCHAR(100),
            date VARCHAR(50),
            link VARCHAR(500)
        );

        CREATE TABLE IF NOT EXISTS lms_courses (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            track VARCHAR(50),
            icon VARCHAR(50),
            level VARCHAR(50),
            description TEXT,
            modules INTEGER DEFAULT 0,
            enrolled INTEGER DEFAULT 0,
            completion INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'active',
            created_at VARCHAR(50),
            submitted_by VARCHAR(200),
            approval_status VARCHAR(20) DEFAULT 'approved',
            rejection_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS lms_modules (
            id VARCHAR(64) PRIMARY KEY,
            course_id VARCHAR(64) REFERENCES lms_courses(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            order_num INTEGER DEFAULT 1,
            icon VARCHAR(50),
            status VARCHAR(20) DEFAULT 'published',
            submitted_by VARCHAR(200),
            approval_status VARCHAR(20) DEFAULT 'approved',
            rejection_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS lms_materials (
            id VARCHAR(64) PRIMARY KEY,
            course_id VARCHAR(64) REFERENCES lms_courses(id) ON DELETE CASCADE,
            module_id VARCHAR(64) REFERENCES lms_modules(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            type VARCHAR(20),
            url TEXT,
            description TEXT,
            created_at VARCHAR(50),
            submitted_by VARCHAR(200),
            approval_status VARCHAR(20) DEFAULT 'approved',
            rejection_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS lms_assignments (
            id VARCHAR(64) PRIMARY KEY,
            course_id VARCHAR(64) REFERENCES lms_courses(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            due_date VARCHAR(50),
            max_score INTEGER DEFAULT 100,
            track VARCHAR(50),
            status VARCHAR(20) DEFAULT 'active',
            created_at VARCHAR(50),
            submitted_by VARCHAR(200),
            approval_status VARCHAR(20) DEFAULT 'approved',
            rejection_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS lms_submissions (
            id VARCHAR(64) PRIMARY KEY,
            assignment_id VARCHAR(64) REFERENCES lms_assignments(id) ON DELETE CASCADE,
            course_id VARCHAR(64) REFERENCES lms_courses(id) ON DELETE CASCADE,
            student_id VARCHAR(64),
            student_name VARCHAR(200),
            student_email VARCHAR(150),
            submitted_at VARCHAR(50),
            content TEXT,
            url TEXT,
            score INTEGER,
            status VARCHAR(30) DEFAULT 'submitted',
            feedback TEXT
        );

        CREATE TABLE IF NOT EXISTS lms_enrollments (
            id VARCHAR(64) PRIMARY KEY,
            course_id VARCHAR(64) REFERENCES lms_courses(id) ON DELETE CASCADE,
            student_id VARCHAR(64),
            student_name VARCHAR(200),
            student_email VARCHAR(150),
            progress_pct INTEGER DEFAULT 0,
            enrolled_at VARCHAR(50),
            last_active VARCHAR(50),
            status VARCHAR(20) DEFAULT 'active'
        );

        -- Student sign-ups for a competition cycle.
        --
        -- This had no table at all. registerStudentForCycle() in the frontend was a
        -- single line -- `studentRegisteredMap[comp.id] = true` -- so a student who
        -- clicked "Register Squad" saw a confirmed badge that vanished on refresh
        -- and was never visible to any organiser.
        CREATE TABLE IF NOT EXISTS competition_registrations (
            id VARCHAR(64) PRIMARY KEY,
            competition_id VARCHAR(64) NOT NULL,
            student_id VARCHAR(64) NOT NULL,
            student_name VARCHAR(200),
            student_email VARCHAR(150),
            track VARCHAR(100),
            status VARCHAR(30) DEFAULT 'registered',
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            withdrawn_at TIMESTAMP NULL
        );
    """)
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);")
    # Resolve duplicate non-null phones before adding UNIQUE
    cur.execute("""
        UPDATE users u1 SET phone = u1.phone || '_dup' || u1.id
        WHERE u1.phone IS NOT NULL
        AND EXISTS (SELECT 1 FROM users u2 WHERE u2.phone = u1.phone AND u2.id <> u1.id)
    """)
    cur.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_unique;")
    cur.execute("ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);")
    cur.execute("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;")
    cur.execute("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS organization VARCHAR(200);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS age_group VARCHAR(50);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS competition_id VARCHAR(100);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_file_id VARCHAR(255);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS doc_file_id VARCHAR(255);")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS comp_type VARCHAR(50) DEFAULT 'qualifier';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS max_teams INTEGER DEFAULT 50;")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS teams INTEGER DEFAULT 0;")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS prize VARCHAR(200) DEFAULT '';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS start_date VARCHAR(50) DEFAULT '';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS end_date VARCHAR(50) DEFAULT '';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS phases TEXT DEFAULT '[]';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS rules TEXT DEFAULT '';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS criteria TEXT DEFAULT '';")
    cur.execute("ALTER TABLE competitions ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;")

    # ── Cycle linkage ────────────────────────────────────────────────────────
    # A "cycle" is a competitions row. Nothing except competition_registrations
    # used to point at one, so no panel could show "the teams in this cycle" or
    # "the submissions for this cycle" -- each panel showed every record it could
    # find, which is why the admin view and the role views never agreed.
    #
    # Nullable on purpose: rows that predate this, and records that genuinely are
    # not cycle-scoped, keep working. NULL means "not attached to a cycle".
    cur.execute("ALTER TABLE teams ADD COLUMN IF NOT EXISTS competition_id VARCHAR(64);")
    cur.execute("ALTER TABLE teams ADD COLUMN IF NOT EXISTS mentor VARCHAR(150) DEFAULT '';")
    cur.execute("ALTER TABLE teams ADD COLUMN IF NOT EXISTS motto VARCHAR(255) DEFAULT '';")
    cur.execute("ALTER TABLE teams ADD COLUMN IF NOT EXISTS roster_list JSONB DEFAULT '[]'::jsonb;")
    cur.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS competition_id VARCHAR(64);")

    # users.competition_id was declared VARCHAR(100) while competitions.id is
    # VARCHAR(64), so a legitimate id could be stored here and never match on a
    # join. Narrow it to match; existing ids are all shorter than 64 chars.
    cur.execute("ALTER TABLE users ALTER COLUMN competition_id TYPE VARCHAR(64);")

    # A new cycle must not be visible to entrants the moment it is created. The
    # default used to be 'active', so any insert that omitted status published
    # the cycle immediately.
    cur.execute("ALTER TABLE competitions ALTER COLUMN status SET DEFAULT 'draft';")

    # The status column has no CHECK constraint and until now nothing validated
    # writes, so arbitrary strings could be stored. Fold case/whitespace first,
    # then park anything still unrecognised in 'draft' -- the only status that
    # cannot mislead an entrant. See app/lifecycle.py for the legal set.
    cur.execute("UPDATE competitions SET status = lower(trim(status)) WHERE status <> lower(trim(status));")
    cur.execute("""
        UPDATE competitions SET status = 'draft'
        WHERE status IS NULL
           OR status NOT IN ('draft', 'registration', 'active', 'completed', 'archived')
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS registration_drafts (
            email VARCHAR(150) PRIMARY KEY,
            draft_data TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lms_progress (
            student_id VARCHAR(100) NOT NULL,
            course_title VARCHAR(200) NOT NULL,
            progress_pct INTEGER DEFAULT 0,
            completed_modules INTEGER DEFAULT 0,
            last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (student_id, course_title)
        );
    """)
    cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS tag VARCHAR(64) DEFAULT '';")
    cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS tag_color VARCHAR(64) DEFAULT '';")
    cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS read_time VARCHAR(32) DEFAULT '5 min';")
    cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;")
    cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS coding_score INTEGER DEFAULT 0;")
    cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS robotics_score INTEGER DEFAULT 0;")
    cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0;")
    cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS cyber_score INTEGER DEFAULT 0;")
    # Set when the server issues a temporary password, so the user is forced to
    # choose their own on next sign-in.
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL;")

    # Grader attribution. Without these, a score exists but nobody owns it --
    # there is no way to answer "who marked this student", to show a judge their
    # own history, or to spot a judge scoring their own school.
    #
    # `graded_by` deliberately has NO foreign key to users(id). Attribution is an
    # audit record: it must survive the grader's account being deleted. A FK with
    # ON DELETE SET NULL would erase exactly the evidence you need when a score
    # is disputed after someone leaves. `graded_by_name` snapshots the display
    # name at grading time for the same reason.
    cur.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS graded_by VARCHAR(64);")
    cur.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS graded_by_name VARCHAR(200);")
    cur.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP NULL;")

    # Self-service profile fields. The profile-completion page collected all of
    # these and then dropped them: submitProfile() only wrote to localStorage,
    # so a judge's expertise/bio and a sponsor's sector/tier vanished the moment
    # they signed in from another device. There was nowhere to put them.
    #
    # `experience_level` already exists above and is reused for judge experience
    # rather than adding a near-duplicate column.
    #
    # Deliberately NOT added: the sponsorship `amount`. A money figure belongs on
    # a sponsorship/payment record with its own audit trail and verification
    # state, not as loose text on the user row.
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise VARCHAR(100);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS sector VARCHAR(100);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS rep_name VARCHAR(200);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50);")

    # `track` is read by the student LMS profile, the judge dashboard's
    # "assigned submissions" filter and the sponsor profile, but it had no column
    # -- every one of those surfaces was reading `undefined` and falling back to
    # a hardcoded literal.
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS track VARCHAR(100);")

    # Link a student user to their `students` row.
    #
    # assignment_submissions.student_id is FK -> students(id), but the frontend
    # sent a ticket string / random 'NTIC-STU-1234', so POST /api/submissions
    # ALWAYS failed with a 400 and no student could ever submit work. Meanwhile
    # lms_progress and lms_enrollments have no FK, so they were being written with
    # yet another id. Three different identifiers for one person.
    #
    # The fix is to make students.id equal users.id for self-provisioned rows, so
    # one id means one person in every table and the existing FK holds without a
    # mapping layer. user_id is kept as an explicit, indexed back-reference for
    # rows that predate this (seeded students keep their original ids).
    cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);")

    # Real ownership for authored LMS content.
    #
    # `submitted_by` is a free-text VARCHAR(200) that the LMS Manager UI hardcoded
    # to the literal 'Admin' on every create, while the instructor's own "My
    # Courses" view matched ownership with `submittedBy.includes(userEmail)`. The
    # result: content an instructor created could never appear in their own list,
    # their dashboard counts, or the admin personnel roster's `courses_authored`.
    # Worse, `submitted_by` and `approval_status` were both accepted from the
    # request body, so authorship could be forged and content self-approved.
    #
    # owner_id is set from the verified session and is what every ownership check
    # uses. `submitted_by` is kept for display and for existing rows.
    for _tbl in ("lms_courses", "lms_modules", "lms_materials", "lms_assignments"):
        cur.execute(f"ALTER TABLE {_tbl} ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64);")
        # Back-fill from submitted_by where it matches a real user's email or name.
        cur.execute(f"""
            UPDATE {_tbl} t SET owner_id = u.id
            FROM users u
            WHERE t.owner_id IS NULL
              AND t.submitted_by IS NOT NULL
              AND (LOWER(t.submitted_by) = LOWER(u.email)
                   OR LOWER(t.submitted_by) = LOWER(u.full_name))
        """)

    # Sponsor commitments and the payments made against them.
    cur.execute("""
        --
        -- Neither table existed. The consequences were:
        --   * The entire "Sponsorship & Partner Ecosystem" infographic was a
        --     hardcoded array in dashboard.component.ts -- MTN/Tullow/GCB/Voltic,
        --     GH₵ 350,000 tiers, a 72% "disbursed" figure and a 98.4% "impact
        --     score", none of which came from anywhere.
        --   * A sponsor recording a payment went through saveUsers() ->
        --     POST /api/bulk-sync (admin-only), so it 403'd and the reference
        --     existed only in that browser.
        --   * Money was stored as loose text on the users row, with no audit trail
        --     and no verification state.
        --
        -- amount is NUMERIC, never a float: binary floating point cannot represent
        -- decimal currency exactly and the errors accumulate when summed.
        CREATE TABLE IF NOT EXISTS sponsorships (
            id VARCHAR(64) PRIMARY KEY,
            sponsor_id VARCHAR(64) NOT NULL,
            organization VARCHAR(200),
            tier VARCHAR(50),
            sector VARCHAR(100),
            amount_pledged NUMERIC(14,2) NOT NULL DEFAULT 0,
            currency VARCHAR(8) DEFAULT 'GHS',
            competition_id VARCHAR(64),
            status VARCHAR(30) DEFAULT 'pending',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- A payment a sponsor SAYS they have made. Nothing in this application
        -- talks to a bank, MoMo API or card processor, so a payment starts as
        -- 'pending_verification' and only an administrator who has checked the
        -- statement may mark it verified. The old UI wrote status 'Confirmed'
        -- immediately, telling sponsors their money had been received.
        CREATE TABLE IF NOT EXISTS sponsorship_payments (
            id VARCHAR(64) PRIMARY KEY,
            sponsorship_id VARCHAR(64) REFERENCES sponsorships(id) ON DELETE CASCADE,
            sponsor_id VARCHAR(64) NOT NULL,
            amount NUMERIC(14,2) NOT NULL,
            currency VARCHAR(8) DEFAULT 'GHS',
            method VARCHAR(40),
            reference VARCHAR(120),
            notes TEXT,
            status VARCHAR(30) DEFAULT 'pending_verification',
            -- No FK: the verification record must survive the reviewer's account
            -- being deleted, exactly as with assignment_submissions.graded_by.
            verified_by VARCHAR(64),
            verified_by_name VARCHAR(200),
            verified_at TIMESTAMP NULL,
            rejection_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Back-fill the link for any student row whose email already matches a user.
    cur.execute("""
        UPDATE students s SET user_id = u.id
        FROM users u
        WHERE s.user_id IS NULL AND LOWER(s.email) = LOWER(u.email)
    """)

    # Collapse duplicate enrolments / submissions before the UNIQUE indexes are
    # created in _create_indexes(). Nothing previously stopped the same student
    # being enrolled on a course twice, and index creation would simply be skipped
    # if duplicates existed -- which would then break the ON CONFLICT upserts the
    # self-service endpoints rely on. Keep the newest row of each group.
    cur.execute("""
        DELETE FROM lms_enrollments e
        USING lms_enrollments keep
        WHERE e.course_id = keep.course_id
          AND e.student_id = keep.student_id
          AND e.id <> keep.id
          AND (e.enrolled_at, e.id) < (keep.enrolled_at, keep.id)
    """)
    cur.execute("""
        DELETE FROM lms_submissions s
        USING lms_submissions keep
        WHERE s.assignment_id = keep.assignment_id
          AND s.student_id = keep.student_id
          AND s.id <> keep.id
          AND (s.submitted_at, s.id) < (keep.submitted_at, keep.id)
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_approvals (
            id VARCHAR(64) PRIMARY KEY,
            type VARCHAR(50) NOT NULL,
            entity VARCHAR(200) NOT NULL,
            contact VARCHAR(150),
            submitted VARCHAR(50),
            details JSONB DEFAULT '{}',
            status VARCHAR(20) DEFAULT 'pending',
            reviewed_at VARCHAR(50),
            reviewer VARCHAR(100),
            rejection_reasons TEXT,
            rejection_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS hero_slides (
            id VARCHAR(64) PRIMARY KEY,
            tag VARCHAR(100),
            title VARCHAR(200),
            description TEXT,
            image VARCHAR(500),
            image_file_id VARCHAR(200),
            video_file_id VARCHAR(200),
            video_url VARCHAR(500),
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS talent_discovery (
            id VARCHAR(64) PRIMARY KEY,
            student_name VARCHAR(200),
            school VARCHAR(200),
            track VARCHAR(100),
            project_title VARCHAR(200),
            talent_tags VARCHAR(500),
            description TEXT,
            mentor VARCHAR(200),
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS platform_stats (
            id VARCHAR(64) PRIMARY KEY DEFAULT 'stats-1',
            regions INTEGER DEFAULT 0,
            mentors INTEGER DEFAULT 0,
            schools INTEGER DEFAULT 0,
            students INTEGER DEFAULT 0,
            projects REAL DEFAULT 0,
            grants REAL DEFAULT 0,
            countdown_date VARCHAR(50),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS csr_updates (
            id VARCHAR(64) PRIMARY KEY,
            title VARCHAR(200),
            description TEXT,
            date VARCHAR(50),
            icon VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS landing_copy (
            key VARCHAR(120) PRIMARY KEY,
            value TEXT,
            section VARCHAR(80),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()

    # Deliberately after the CREATE block above, not up with the other ALTERs:
    # pending_approvals is created here, so altering it earlier fails on a fresh
    # database and aborts the whole schema init.
    #
    # Applications need to be attributable to a cycle for the same reason teams
    # do -- the records and reporting panels can scope teams and submissions by
    # cycle but had nothing to filter approvals on, so a reviewer looking at one
    # cycle saw every application ever filed. Nullable: rows filed before this,
    # and applications that are not cycle-specific, keep working.
    cur.execute("ALTER TABLE pending_approvals ADD COLUMN IF NOT EXISTS competition_id VARCHAR(64);")
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_pending_approvals_competition "
        "ON pending_approvals (competition_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_pending_approvals_status "
        "ON pending_approvals (status);"
    )
    conn.commit()

    _create_indexes(cur)
    conn.commit()
    cur.close()

    # Run seeder
    seed_initial_data(conn)


def _create_indexes(cur):
    """Create the indexes the query patterns in main.py actually need.

    PostgreSQL does NOT automatically index foreign-key columns, so before this
    every cascade delete and every child lookup was a sequential scan. Each
    statement is IF NOT EXISTS so this is safe to re-run on every boot.
    """
    statements = [
        # ── Authentication: hit on literally every request ──
        # login/lookup filter on lower(email); a plain index cannot serve that,
        # so the expression must match the query.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));",
        "CREATE INDEX IF NOT EXISTS idx_users_ticket_upper ON users (upper(ticket));",
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);",
        # The judging queue filters on "not yet scored" and the judge's own
        # history filters on graded_by, both on every page load.
        "CREATE INDEX IF NOT EXISTS idx_asub_ungraded ON assignment_submissions (created_at) WHERE score IS NULL;",
        "CREATE INDEX IF NOT EXISTS idx_asub_graded_by ON assignment_submissions (graded_by);",
        # auth_sessions.token is the PK, but these two are not indexed:
        # user_id -> revoke-all-sessions-for-user; expires_at -> the pruning job.
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);",
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);",
        "CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_challenges (expires_at);",
        "CREATE INDEX IF NOT EXISTS idx_otp_target_purpose ON otp_challenges (target, purpose);",
        # Every rate-limit check filters on (bucket, hit_at); without this the
        # check degrades into a full scan of a hot, high-churn table.
        "CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_time ON rate_limit_hits (bucket, hit_at);",

        # ── Foreign keys (unindexed FKs make DELETE parents O(n) per row) ──
        "CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON assignment_submissions (student_id);",
        "CREATE INDEX IF NOT EXISTS idx_submissions_status ON assignment_submissions (status);",
        "CREATE INDEX IF NOT EXISTS idx_lms_modules_course_id ON lms_modules (course_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_materials_course_id ON lms_materials (course_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_materials_module_id ON lms_materials (module_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_assignments_course_id ON lms_assignments (course_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_submissions_assignment_id ON lms_submissions (assignment_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_submissions_course_id ON lms_submissions (course_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_submissions_student_id ON lms_submissions (student_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_enrollments_course_id ON lms_enrollments (course_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_enrollments_student_id ON lms_enrollments (student_id);",

        # One enrolment per student per course, and one live submission per student
        # per assignment. Without these, "enrol" clicked twice produced two rows
        # (double-counting the course roster) and a resubmission produced a second
        # row, leaving the instructor two copies to grade with no way to tell which
        # was current.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_enrollments_unique "
        "ON lms_enrollments (course_id, student_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_submissions_unique "
        "ON lms_submissions (assignment_id, student_id);",

        # One registration per student per competition cycle.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_reg_unique "
        "ON competition_registrations (competition_id, student_id);",
        "CREATE INDEX IF NOT EXISTS idx_comp_reg_student "
        "ON competition_registrations (student_id);",
        "CREATE INDEX IF NOT EXISTS idx_comp_reg_competition "
        "ON competition_registrations (competition_id, status);",

        # Unique link from a students row back to its user account.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_students_user_id "
        "ON students (user_id) WHERE user_id IS NOT NULL;",

        # Ownership lookups: "my courses", and the moderation queue.
        "CREATE INDEX IF NOT EXISTS idx_lms_courses_owner ON lms_courses (owner_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_courses_approval ON lms_courses (approval_status);",
        "CREATE INDEX IF NOT EXISTS idx_lms_modules_owner ON lms_modules (owner_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_materials_owner ON lms_materials (owner_id);",
        "CREATE INDEX IF NOT EXISTS idx_lms_assignments_owner ON lms_assignments (owner_id);",
        # The instructor grading queue: ungraded submissions.
        "CREATE INDEX IF NOT EXISTS idx_lms_submissions_ungraded "
        "ON lms_submissions (course_id) WHERE score IS NULL;",

        # Sponsorships: "my pledges", the admin roster, and the ecosystem aggregates.
        "CREATE INDEX IF NOT EXISTS idx_sponsorships_sponsor ON sponsorships (sponsor_id);",
        "CREATE INDEX IF NOT EXISTS idx_sponsorships_status ON sponsorships (status);",
        "CREATE INDEX IF NOT EXISTS idx_sponsorships_tier ON sponsorships (tier);",
        "CREATE INDEX IF NOT EXISTS idx_sponsor_payments_sponsorship "
        "ON sponsorship_payments (sponsorship_id);",
        "CREATE INDEX IF NOT EXISTS idx_sponsor_payments_sponsor "
        "ON sponsorship_payments (sponsor_id);",
        # The admin verification queue.
        "CREATE INDEX IF NOT EXISTS idx_sponsor_payments_pending "
        "ON sponsorship_payments (status) WHERE status = 'pending_verification';",

        # ── Cycle linkage ──
        # Every panel filters its records by cycle, so each of these columns is
        # on the hot path for "show me this cycle's teams / submissions /
        # sponsors / entrants". Declared here rather than beside the ALTERs
        # because sponsorships is created further down this same function.
        "CREATE INDEX IF NOT EXISTS idx_teams_competition ON teams (competition_id);",
        "CREATE INDEX IF NOT EXISTS idx_submissions_competition "
        "ON assignment_submissions (competition_id);",
        "CREATE INDEX IF NOT EXISTS idx_sponsorships_competition "
        "ON sponsorships (competition_id);",
        "CREATE INDEX IF NOT EXISTS idx_users_competition ON users (competition_id);",
        "CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions (status);",

        # ── Frequently filtered / ordered columns ──
        "CREATE INDEX IF NOT EXISTS idx_students_email_lower ON students (lower(email));",
        "CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON support_tickets (user_id);",
        "CREATE INDEX IF NOT EXISTS idx_tickets_last_updated ON support_tickets (last_updated DESC);",
        "CREATE INDEX IF NOT EXISTS idx_tickets_is_deleted ON support_tickets (is_deleted);",
        "CREATE INDEX IF NOT EXISTS idx_approvals_status ON pending_approvals (status);",
        "CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON registration_drafts (updated_at);",
        "CREATE INDEX IF NOT EXISTS idx_lms_progress_student_id ON lms_progress (student_id);",
        # audit_logs already has idx_audit_logs_id_desc; retention prunes on
        # `time` and filters on `type`, neither of which was indexed.
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs (type);",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs (time);",
    ]
    created = 0
    for stmt in statements:
        try:
            cur.execute(stmt)
            created += 1
        except Exception as exc:
            # A single unsupported index must not stop the app from booting.
            # Most likely cause: pre-existing duplicate rows blocking a UNIQUE
            # index, which is worth seeing in the logs.
            logger.warning(f"Index skipped ({stmt.split(' ')[5]}): {exc}")
            try:
                cur.connection.rollback()
            except Exception:
                pass
    logger.info(f"Index check complete: {created}/{len(statements)} verified.")


# ── Connection Pool & Helpers ──
_pool = None

def init_connection_pool():
    """Initialize a ThreadedConnectionPool for high-concurrency scaling."""
    global _pool
    if _pool is not None:
        return _pool
    import os
    try:
        from psycopg2.pool import ThreadedConnectionPool
    except ImportError:
        logger.warning("psycopg2.pool not available")
        return None

    # Try URL connections first
    for url_key in ("DATABASE_PRIVATE_URL", "DATABASE_URL"):
        db_url = os.environ.get(url_key, "").strip()
        if db_url:
            try:
                _pool = ThreadedConnectionPool(minconn=2, maxconn=35, dsn=db_url, connect_timeout=10)
                logger.info(f"Initialized PostgreSQL ThreadedConnectionPool via {url_key} (max 35 connections)")
                return _pool
            except Exception as e:
                logger.warning(f"Failed initializing connection pool via {url_key}: {e}")

    # Fallback to individual vars
    db_host = settings.POSTGRES_HOST
    if db_host in ("localhost", ""):
        db_host = "127.0.0.1"
    try:
        _pool = ThreadedConnectionPool(
            minconn=2,
            maxconn=35,
            host=db_host,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB,
            connect_timeout=10
        )
        logger.info(f"Initialized PostgreSQL ThreadedConnectionPool via host vars ({db_host}:{settings.POSTGRES_PORT})")
        return _pool
    except Exception as e:
        logger.warning(f"Could not initialize connection pool via host vars: {e}")
        return None


def get_db_connection():
    """Return a connection from the ThreadedConnectionPool, or a fresh connection if pool is unavailable."""
    global _pool
    if _pool is None:
        init_connection_pool()
    if _pool is not None:
        try:
            return _pool.getconn()
        except Exception as e:
            logger.warning(f"Pool getconn failed, falling back to direct connect: {e}")

    # Fallback direct connect
    import os, psycopg2
    for url_key in ("DATABASE_PRIVATE_URL", "DATABASE_URL"):
        db_url = os.environ.get(url_key, "").strip()
        if db_url:
            try:
                return psycopg2.connect(db_url, connect_timeout=10)
            except Exception:
                pass
    db_host = settings.POSTGRES_HOST
    if db_host in ("localhost", ""):
        db_host = "127.0.0.1"
    try:
        return psycopg2.connect(
            host=db_host,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB,
            connect_timeout=10,
        )
    except Exception as e:
        logger.error(f"PostgreSQL connection failed: {e}")
        return None


def release_db_connection(conn):
    """Safely return a connection to the pool or close it."""
    global _pool
    if conn is None:
        return
    if _pool is not None:
        try:
            _pool.putconn(conn)
            return
        except Exception:
            pass
    try:
        conn.close()
    except Exception:
        pass
