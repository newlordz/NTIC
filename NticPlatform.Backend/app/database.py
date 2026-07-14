import logging
from app.config import settings

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
        admin_conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname="postgres"
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
        """)
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Successfully connected to PostgreSQL ({settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}) and initialized tables.")
        return True, "OK"
    except Exception as e:
        logger.error(f"Error initializing schema: {e}")
        return False, str(e)


def get_db_connection():
    """Return a fresh psycopg2 connection to NticPlatformDb."""
    import psycopg2
    try:
        conn = psycopg2.connect(
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            dbname=settings.POSTGRES_DB
        )
        return conn
    except Exception as e:
        logger.error(f"PostgreSQL connection failed: {e}")
        return None
