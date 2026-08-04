import os
from app.security import hash_password

def seed_initial_data(conn):
    cur = conn.cursor()

    # Platform users (real login accounts)
    cur.execute("SELECT count(*) FROM users")
    if cur.fetchone()[0] == 0:
        admin_password = os.getenv("NTIC_ADMIN_PASSWORD", "Admin@Ntic2026!")
        cur.execute(
            "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status) VALUES (%s, %s, %s, %s, %s, %s, 'Active')",
            (
                "USR-000",
                "admin@ntic.org.gh",
                "Admin",
                "super_admin",
                "NTIC-ADM-0000",
                hash_password(admin_password),
            ),
        )
    # Philosophy Cards
    cur.execute("SELECT count(*) FROM philosophy_cards")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO philosophy_cards (id, title, description, image) VALUES ('phil-1', 'Learn', 'Pushing the boundaries of what is known to uncover new possibilities.', 'assets/ntic_image_14.jpeg')")
        cur.execute("INSERT INTO philosophy_cards (id, title, description, image) VALUES ('phil-2', 'Innovate', 'Designing intelligent, creative solutions for tomorrow''s challenges.', 'assets/ntic_image_25.jpeg')")
        cur.execute("INSERT INTO philosophy_cards (id, title, description, image) VALUES ('phil-3', 'Build', 'Turning abstract ideas into concrete reality through engineering.', 'assets/ntic_image_33.jpeg')")

    # Events
    cur.execute("SELECT count(*) FROM events")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO events (id, title, date, time, location, description, type) VALUES ('evt-1', 'National Robotics Qualifier', '2026-08-15', '09:00 AM', 'Accra International Conference Centre', 'The first stage of the robotics competition where teams demonstrate their autonomous rovers.', 'competition')")
        cur.execute("INSERT INTO events (id, title, date, time, location, description, type) VALUES ('evt-2', 'AI & Ethics Webinar', '2026-08-22', '02:00 PM', 'Online (Google Meet)', 'A deep dive into the ethical implications of AI models in education and healthcare.', 'webinar')")
        cur.execute("INSERT INTO events (id, title, date, time, location, description, type) VALUES ('evt-3', 'Cybersecurity Capture The Flag', '2026-09-05', '10:00 AM', 'Virtual Lab Environment', 'Teams will compete to find vulnerabilities and patch systems in a simulated corporate network.', 'competition')")

    # Stories
    cur.execute("SELECT count(*) FROM stories")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES ('st-1', 'NTIC 2026 Launch Exceeds Expectations', 'Over 500 schools registered in the first week, setting a new record for NTI participation in Ghana.', '2026-07-28', 'assets/ntic_image_4.jpeg')")
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES ('st-2', 'New Quantum Computing Track Announced', 'In partnership with IBM, we are introducing a pilot track for quantum programming.', '2026-07-29', 'assets/ntic_image_7.jpeg')")
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES ('st-3', 'Meet the Lead Judges for 2026', 'Get to know the industry experts who will be evaluating your final project submissions.', '2026-07-30', 'assets/ntic_image_12.jpeg')")

    # Schools
    cur.execute("SELECT count(*) FROM schools")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-1', 'PRESEC Legon', 'Greater Accra', 12, 1450, 1, 'Active')")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-2', 'Achimota School', 'Greater Accra', 10, 1380, 2, 'Active')")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-3', 'Prempeh College', 'Ashanti', 9, 1320, 3, 'Active')")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-4', 'Wesley Girls High School', 'Central', 8, 1290, 4, 'Active')")

    # HoF Entries
    cur.execute("SELECT count(*) FROM hof_entries")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO hof_entries (id, type, initials, name, team_name, project_title, members, school, year, badge, track_class) VALUES ('hof-group-1', 'group', 'CR', 'CyberRangers', 'CyberRangers Squad', 'Zero-Trust Autonomous Firewall System', '[\"Kofi Nyarko\", \"Abena Mensah\", \"Emmanuel Osei\", \"Selorm Adjei\"]', 'Prempeh College', '2025', 'Cybersecurity Grand Champions', 'cyber-track')")
        cur.execute("INSERT INTO hof_entries (id, type, initials, name, school, year, badge, track_class) VALUES ('hof-1', 'individual', 'EA', 'Ekow Asante', 'Mfantsipim School', '2025', 'Coding Champion', 'coding-track')")
        cur.execute("INSERT INTO hof_entries (id, type, initials, name, team_name, project_title, members, school, year, badge, track_class) VALUES ('hof-group-2', 'group', 'AI', 'RoboQuest Alpha', 'RoboQuest Alpha', 'Solar Autonomous Agri-Rover', '[\"Abigail Serwaa\", \"Akosua Baako\", \"Ama Opoku\"]', 'Wesley Girls High School', '2025', 'Robotics Team Champions', 'robotics-track')")

    # News Items
    cur.execute("SELECT count(*) FROM news_items")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES ('news-1', 'Phase 2 Registration Opens for All 16 Regions', 'Competition', '2026-07-28', '#registration')")
        cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES ('news-2', 'NTIC 2026 Sees Record 500+ School Registrations', 'Milestone', '2026-07-25', '#news')")
        cur.execute("INSERT INTO news_items (id, headline, tag, date, link) VALUES ('news-3', 'New AI & Machine Learning Track Launched', 'Track', '2026-07-20', '#competitions')")

    # LMS Courses
    cur.execute("SELECT count(*) FROM lms_courses")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status) VALUES ('crs-1', 'Python Data Structures', 'coding', 'data_object', 'Intermediate', 'Master lists, dicts, sets, and tuples for competitive programming.', 8, 320, 68, 'active', '2026-01-15', 'Dr. Ebenezer Mensah (Achimota School)', 'approved')")
        cur.execute("INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status) VALUES ('crs-2', 'Arduino Robotics Base', 'robotics', 'memory', 'Beginner', 'Build and program your first autonomous robot with Arduino.', 6, 180, 42, 'active', '2026-01-20', 'Eng. Sarah Kwofie (PRESEC Legon)', 'approved')")
        cur.execute("INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status) VALUES ('crs-3', 'AI Fundamentals with TensorFlow', 'ai', 'psychology', 'Intermediate', 'Train, evaluate, and deploy machine learning models.', 10, 210, 55, 'active', '2026-02-01', 'Prof. Kwesi Appiah (KNUST NTI Lab)', 'approved')")
        cur.execute("INSERT INTO lms_courses (id, title, track, icon, level, description, modules, enrolled, completion, status, created_at, submitted_by, approval_status) VALUES ('crs-4', 'Network Security Essentials', 'cyber', 'shield', 'Beginner', 'Learn firewalls, encryption, and penetration testing basics.', 7, 145, 38, 'active', '2026-02-10', 'Dr. Ebenezer Mensah (Achimota School)', 'approved')")

    conn.commit()
    cur.close()
