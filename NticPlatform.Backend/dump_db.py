import psycopg2
from app.config import settings

try:
    conn = psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        dbname=settings.POSTGRES_DB
    )
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
    tables = [t[0] for t in cur.fetchall()]

    for t in tables:
        print(f"### Table: {t}")
        cur.execute(f"SELECT * FROM {t}")
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        headers = " | ".join(cols)
        separators = " | ".join(["---"] * len(cols))
        print(headers)
        print(separators)
        for r in rows:
            print(" | ".join(str(x) if x is not None else "NULL" for x in r))
        print("\n")

    cur.close()
    conn.close()
except Exception as e:
    print(f"Error dumping tables: {e}")
