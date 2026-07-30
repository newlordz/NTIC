def seed_initial_data(conn):
    cur = conn.cursor()
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
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES ('st-1', 'NTIC 2026 Launch Exceeds Expectations', 'Over 500 schools registered in the first week, setting a new record for STEM participation in Ghana.', '2026-07-28', 'assets/ntic_image_4.jpeg')")
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES ('st-2', 'New Quantum Computing Track Announced', 'In partnership with IBM, we are introducing a pilot track for quantum programming.', '2026-07-29', 'assets/ntic_image_7.jpeg')")
        cur.execute("INSERT INTO stories (id, title, excerpt, date, image) VALUES ('st-3', 'Meet the Lead Judges for 2026', 'Get to know the industry experts who will be evaluating your final project submissions.', '2026-07-30', 'assets/ntic_image_12.jpeg')")

    # Schools
    cur.execute("SELECT count(*) FROM schools")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-1', 'PRESEC Legon', 'Greater Accra', 12, 1450, 1, 'Active')")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-2', 'Achimota School', 'Greater Accra', 10, 1380, 2, 'Active')")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-3', 'Prempeh College', 'Ashanti', 9, 1320, 3, 'Active')")
        cur.execute("INSERT INTO schools (id, name, region, teams, score, rank, status) VALUES ('sch-4', 'Wesley Girls High School', 'Central', 8, 1290, 4, 'Active')")

    conn.commit()
    cur.close()
