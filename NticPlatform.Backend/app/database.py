import logging
from app.config import settings
from app.seed import seed_initial_data

logger = logging.getLogger("ntic.db")

def init_postgres_db():
    """Ensure NticPlatformDb database and schema exist."""
    try:
        import psycopg2
        from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    except ImportError:
        logger.warning("psycopg2 not installed yet. Run 'pip install -r requirements.txt'")
        return False, "psycopg2 not installed"

    # Step 1: Ensure database exists
    try:
        # Force TCP by converting localhost to 127.0.0.1 (Linux defaults localhost to Unix socket)
        db_host = settings.POSTGRES_HOST
        if db_host in ("localhost", ""):
            db_host = "127.0.0.1"
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
        exists = cur.fetchone()
        if not exists:
            logger.info(f"Creating PostgreSQL database: {settings.POSTGRES_DB}...")
            cur.execute(f'CREATE DATABASE "{settings.POSTGRES_DB}"')
        cur.close()
        admin_conn.close()
    except Exception as e:
        logger.warning(f"Note checking/creating database: {e}")

    # Step 2: Connect to target database and create tables
    try:
        conn = get_db_connection()
        if not conn:
            return False, "Could not connect to NticPlatformDb"

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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                type VARCHAR(50)
            );

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
        cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS tag VARCHAR(64) DEFAULT '';")
        cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS tag_color VARCHAR(64) DEFAULT '';")
        cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS read_time VARCHAR(32) DEFAULT '5 min';")
        cur.execute("ALTER TABLE stories ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;")
        cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS coding_score INTEGER DEFAULT 0;")
        cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS robotics_score INTEGER DEFAULT 0;")
        cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0;")
        cur.execute("ALTER TABLE schools ADD COLUMN IF NOT EXISTS cyber_score INTEGER DEFAULT 0;")

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
        """)
        conn.commit()
        cur.close()

        # Run seeder
        seed_initial_data(conn)

        conn.close()
        logger.info(f"Successfully connected to PostgreSQL ({settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}), created tables, and seeded initial data.")
        return True, "OK"
    except Exception as e:
        logger.error(f"Error initializing schema: {e}")
        return False, str(e)


def get_db_connection():
    """Return a fresh psycopg2 connection to NticPlatformDb."""
    import os, psycopg2
    # Try DATABASE_URL first (Railway standard)
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        try:
            conn = psycopg2.connect(database_url)
            logger.info("Connected to PostgreSQL via DATABASE_URL")
            return conn
        except Exception as e:
            logger.warning(f"PostgreSQL connection via DATABASE_URL failed: {e}")
    # Fallback to individual POSTGRES_ vars (local dev)
    # Force TCP by converting localhost to 127.0.0.1 (Linux defaults localhost to Unix socket)
    db_host = settings.POSTGRES_HOST
    if db_host in ("localhost", ""):
        db_host = "127.0.0.1"
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB,
            connect_timeout=10,
        )
        logger.info(f"Connected to PostgreSQL via individual vars: {db_host}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}")
        return conn
    except Exception as e:
        logger.error(f"PostgreSQL connection failed: {e}")
        return None
