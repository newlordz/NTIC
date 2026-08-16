import os
import logging
import secrets
from app.security import hash_password

logger = logging.getLogger("ntic.seed")

ADMIN_EMAIL = "admin@ntic.org.gh"
ADMIN_ID = "USR-000"


def _resolve_admin_password() -> tuple[str, bool]:
    """Return (password, was_generated).

    The password is NEVER hardcoded. If NTIC_ADMIN_PASSWORD is unset we mint a
    strong random one and log it once so the operator can retrieve it from the
    deploy logs and change it immediately.
    """
    env_password = os.getenv("NTIC_ADMIN_PASSWORD", "").strip()
    if env_password:
        if len(env_password) < 12:
            logger.warning(
                "NTIC_ADMIN_PASSWORD is shorter than 12 characters. "
                "Use a longer, unique value."
            )
        return env_password, False
    return secrets.token_urlsafe(24), True


def seed_initial_data(conn):
    cur = conn.cursor()

    # ── Bootstrap super-admin ─────────────────────────────────────────
    # Rule: create the account if it is missing. NEVER touch the password or
    # status of an account that already exists — that would silently undo a
    # password rotation or re-enable a deliberately disabled admin on every
    # restart. An intentional reset requires NTIC_ADMIN_PASSWORD_RESET=true.
    cur.execute(
        "SELECT id FROM users WHERE email = %s OR id = %s",
        (ADMIN_EMAIL, ADMIN_ID),
    )
    admin_row = cur.fetchone()

    if not admin_row:
        admin_password, was_generated = _resolve_admin_password()
        cur.execute(
            "INSERT INTO users (id, email, full_name, role, ticket, password_hash, status) VALUES (%s, %s, %s, %s, %s, %s, 'Active')",
            (
                ADMIN_ID,
                ADMIN_EMAIL,
                "Admin",
                "super_admin",
                "NTIC-ADM-0000",
                hash_password(admin_password),
            ),
        )
        if was_generated:
            logger.warning(
                "=" * 72
                + f"\nNTIC_ADMIN_PASSWORD was not set. A super-admin account was created:"
                + f"\n  email:    {ADMIN_EMAIL}"
                + f"\n  password: {admin_password}"
                + "\nThis password is shown ONCE. Change it immediately and set"
                + "\nNTIC_ADMIN_PASSWORD in your environment.\n"
                + "=" * 72
            )
        else:
            logger.info("Super-admin account created using NTIC_ADMIN_PASSWORD.")
    elif os.getenv("NTIC_ADMIN_PASSWORD_RESET", "").strip().lower() == "true":
        admin_password, was_generated = _resolve_admin_password()
        cur.execute(
            "UPDATE users SET password_hash = %s, status = 'Active' WHERE id = %s",
            (hash_password(admin_password), admin_row[0]),
        )
        # Force re-authentication everywhere after a deliberate reset.
        cur.execute("DELETE FROM auth_sessions WHERE user_id = %s", (admin_row[0],))
        if was_generated:
            logger.warning(
                "=" * 72
                + "\nNTIC_ADMIN_PASSWORD_RESET=true and no NTIC_ADMIN_PASSWORD was set."
                + f"\nThe super-admin password was reset to: {admin_password}"
                + "\nShown ONCE. Change it and unset NTIC_ADMIN_PASSWORD_RESET.\n"
                + "=" * 72
            )
        else:
            logger.warning(
                "NTIC_ADMIN_PASSWORD_RESET=true — super-admin password reset from "
                "NTIC_ADMIN_PASSWORD and all its sessions revoked. "
                "Unset NTIC_ADMIN_PASSWORD_RESET to avoid resetting on every restart."
            )
    else:
        logger.info("Super-admin account already exists — leaving password and status untouched.")
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
        cur.execute("INSERT INTO events (id, title, date, time, location, description, type) VALUES ('evt-3', 'Networking & Cybersecurity Capture The Flag', '2026-09-05', '10:00 AM', 'Virtual Lab Environment', 'Teams will compete to find vulnerabilities and patch systems in a simulated corporate network.', 'competition')")

    # Stories (upsert — skip if ID already exists)
    stories = [
        ('st-1', 'Achimota School Builds Autonomous Rover for Desert Navigation', 'Team Volta developed an autonomous rover using computer vision and LIDAR sensors, winning the Regional Robotics Qualifier in Greater Accra.', '2026-06-28', 'assets/ntic_image_1.jpeg', 'Robotics', 'robotics', '5 min', 24),
        ('st-2', "Wesley Girls' Coding Team Ships a Full-Stack Health App in 48 Hours", "A 4-student team built and deployed a telemedicine platform connecting rural clinics with urban doctors within a 48-hour hackathon deadline.", '2026-06-22', 'assets/ntic_image_2.jpeg', 'Coding', 'coding', '4 min', 18),
        ('st-3', 'PRESEC Legon Students Simulate a Nation-State Cyber Attack in Finals', 'The cybersecurity track finale saw PRESEC Legon execute a realistic nation-state attack simulation with advanced penetration testing skills.', '2026-06-15', 'assets/ntic_image_3.jpeg', 'Networking & Cybersecurity', 'cyber', '6 min', 31),
        ('st-4', 'Opoku War School AI Model Detects Cassava Disease with 94% Accuracy', 'Three SHS students built a CNN pipeline that identifies cassava mosaic disease from leaf photos, helping farmers act before crops are lost.', '2026-06-10', 'assets/ntic_image_4.jpeg', 'AI', 'ai', '5 min', 42),
        ('st-5', 'Mfantsipim Students Prototype a Solar-Powered Water Purification System', "Using Ghana's abundant sunlight, the team designed a low-cost UV sterilisation unit providing clean water to off-grid communities.", '2026-06-05', 'assets/ntic_image_7.jpeg', 'Innovation', 'innovation', '4 min', 27),
        ('st-6', 'Adisadel College Dominates Regional Algorithm Sprint', 'Adisadel College students swept the top three spots in the Western Region algorithm sprint, solving dynamic programming challenges at record speed.', '2026-05-30', 'assets/ntic_image_12.jpeg', 'Coding', 'coding', '3 min', 15),
        ('st-7', 'GHACSE Robotics Bridge Challenge Draws 80 Teams Nationwide', 'Kumasi Academy took first place with a span holding 45 kg in the annual structural engineering sprint challenging teams to build load-bearing bridges.', '2026-05-24', 'assets/ntic_image_9.jpeg', 'Robotics', 'robotics', '5 min', 19),
        ('st-8', 'Accra Academy Students Build a Multilingual Voice Assistant for Farmers', 'Using open-source speech models fine-tuned on Twi, Ewe, and Ga, the team created a voice-first interface for crop pricing and weather info.', '2026-05-18', 'assets/ntic_image_14.jpeg', 'AI', 'ai', '6 min', 36),
    ]
    cur.execute("SELECT count(*) FROM stories")
    if cur.fetchone()[0] == 0:
        for s in stories:
            cur.execute(
                "INSERT INTO stories (id, title, excerpt, date, image, tag, tag_color, read_time, likes) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)", s
            )
    else:
        # Backfill tag/tag_color on old rows that have empty tags
        tag_map = {
            'st-1': ('Robotics', 'robotics'), 'st-2': ('Coding', 'coding'),
            'st-3': ('Networking & Cybersecurity', 'cyber'),
        }
        for sid, (tag, color) in tag_map.items():
            cur.execute("UPDATE stories SET tag=%s, tag_color=%s WHERE id=%s AND (tag IS NULL OR tag='')", (tag, color, sid))
        # Insert any missing stories (st-4 through st-8)
        existing = set()
        cur.execute("SELECT id FROM stories")
        for row in cur.fetchall():
            existing.add(row[0])
        for s in stories:
            if s[0] not in existing:
                cur.execute(
                    "INSERT INTO stories (id, title, excerpt, date, image, tag, tag_color, read_time, likes) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)", s
                )

    # Schools
    cur.execute("SELECT count(*) FROM schools")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status, coding_score, robotics_score, ai_score, cyber_score) VALUES ('sch-1', 'PRESEC Legon', 'Greater Accra', 12, 1450, 1, 'Active', 380, 360, 350, 360)")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status, coding_score, robotics_score, ai_score, cyber_score) VALUES ('sch-2', 'Achimota School', 'Greater Accra', 10, 1380, 2, 'Active', 370, 340, 320, 350)")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status, coding_score, robotics_score, ai_score, cyber_score) VALUES ('sch-3', 'Prempeh College', 'Ashanti', 9, 1320, 3, 'Active', 320, 350, 340, 310)")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status, coding_score, robotics_score, ai_score, cyber_score) VALUES ('sch-4', 'Wesley Girls High School', 'Central', 8, 1290, 4, 'Active', 340, 330, 310, 310)")
    else:
        cur.execute("UPDATE schools SET coding_score = 380, robotics_score = 360, ai_score = 350, cyber_score = 360 WHERE id = 'sch-1'")
        cur.execute("UPDATE schools SET coding_score = 370, robotics_score = 340, ai_score = 320, cyber_score = 350 WHERE id = 'sch-2'")
        cur.execute("UPDATE schools SET coding_score = 320, robotics_score = 350, ai_score = 340, cyber_score = 310 WHERE id = 'sch-3'")
        cur.execute("UPDATE schools SET coding_score = 340, robotics_score = 330, ai_score = 310, cyber_score = 310 WHERE id = 'sch-4'")

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

    # Hero Slides
    cur.execute("SELECT count(*) FROM hero_slides")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO hero_slides (id, tag, title, description, image, sort_order) VALUES ('slide-1', 'Ghana''s Premier Tech Championship', 'National Tech Innovation Championship 2026', 'Empowering the next generation of Ghanaian innovators through Coding, Robotics, AI, Networking & Cybersecurity, and Open Innovation.', 'assets/ntic_image_1.jpeg', 0)")
        cur.execute("INSERT INTO hero_slides (id, tag, title, description, image, sort_order) VALUES ('slide-2', '500+ Schools Registered', 'Over 16 Regions Represented', 'From Accra to Tamale, young minds are competing to solve real-world problems with technology.', 'assets/ntic_image_4.jpeg', 1)")
        cur.execute("INSERT INTO hero_slides (id, tag, title, description, image, sort_order) VALUES ('slide-3', 'Innovate. Build. Lead.', 'Ready to Make an Impact?', 'Join Ghana''s largest high school tech competition. Registration is open for all tracks.', 'assets/ntic_image_7.jpeg', 2)")

    # Platform Stats
    cur.execute("SELECT count(*) FROM platform_stats")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO platform_stats (id, regions, mentors, schools, students, projects, grants, countdown_date) VALUES ('stats-1', 16, 85, 512, 12, 3.2, 2.5, '2026-08-15T09:00:00')")

    # Talent Discovery
    cur.execute("SELECT count(*) FROM talent_discovery")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO talent_discovery (id, student_name, school, track, project_title, talent_tags, description, mentor, status) VALUES ('td-1', 'Kofi Nyarko', 'Prempeh College', 'Cyber', 'Zero-Trust Firewall System', 'Cybersecurity,Networking,Python', 'Discovered exceptional talent in network security. Built a zero-trust architecture prototype that impressed judges.', 'Dr. Ama Serwaa', 'active')")
        cur.execute("INSERT INTO talent_discovery (id, student_name, school, track, project_title, talent_tags, description, mentor, status) VALUES ('td-2', 'Abigail Serwaa', 'Wesley Girls', 'Robotics', 'Solar Agri-Rover', 'Robotics,Python,IoT', 'Led an all-female team to build a solar-powered autonomous rover for precision agriculture.', 'Eng. Sarah Kwofie', 'active')")

    # CSR Updates
    cur.execute("SELECT count(*) FROM csr_updates")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO csr_updates (id, title, description, date, icon) VALUES ('csr-1', 'Solar Lab Launched in Tamale', 'NTIC installed a solar-powered computer lab at Tamale Senior High, serving 1,200 students with sustainable tech education.', '2026-07-15', 'solar_power')")
        cur.execute("INSERT INTO csr_updates (id, title, description, date, icon) VALUES ('csr-2', 'Girls in Tech Bootcamp', '200 female students across 8 regions attended a 3-day coding and robotics bootcamp sponsored by NTIC partners.', '2026-06-20', 'diversity_3')")

    conn.commit()
    cur.close()
