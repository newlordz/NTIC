"""Canonical definitions for the editable landing-page copy.

Every piece of static marketing text on the landing page is described here as a
(key, section, default) triple. The defaults mirror the hard-coded strings that
previously lived in `landing.component.html`, so seeding them keeps the public
page byte-for-byte identical until an admin edits a value in the CMS.

Keys are namespaced by section (e.g. `about.card1.title`) so they are stable and
self-documenting. The `section` label is only used for grouping in the CMS and
for the seed; the landing page resolves text purely by `key`.
"""

# Ordered list of (section, key, default_value). Order defines the grouping the
# admin panel renders and the order defaults are seeded.
LANDING_COPY_DEFAULTS = [
    # ── Header & Navigation ─────────────────────────────────────────
    ("Header & Navigation", "header.brandName", "NTI Championship"),
    ("Header & Navigation", "header.brandSub", "GHANA NATIONAL COMPETITION"),
    ("Header & Navigation", "header.navCompetition", "Competition"),
    ("Header & Navigation", "header.navConcept", "Concept"),
    ("Header & Navigation", "header.navTracks", "Competition Track Arenas"),
    ("Header & Navigation", "header.navLogin", "Login"),
    ("Header & Navigation", "header.applyNow", "Apply now"),

    # ── Mega Menu ───────────────────────────────────────────────────
    ("Mega Menu", "menu.title", "The 5 Core Arenas"),
    ("Mega Menu", "menu.intro", "High school squads specialize in a track, preparing projects and competing under strict national rules."),
    ("Mega Menu", "menu.allTracks", "All Tracks Guide"),
    ("Mega Menu", "menu.coding.name", "Coding & Algorithms"),
    ("Mega Menu", "menu.coding.desc", "Timed code sprints & optimizations."),
    ("Mega Menu", "menu.robotics.name", "Robotics & IoT"),
    ("Mega Menu", "menu.robotics.desc", "Autonomous bot navigational engineering."),
    ("Mega Menu", "menu.ai.name", "Artificial Intelligence"),
    ("Mega Menu", "menu.ai.desc", "Crop diagnostics and transport logistics ML."),
    ("Mega Menu", "menu.cyber.name", "Networking & Cybersecurity CTF"),
    ("Mega Menu", "menu.cyber.desc", "Defensive systems and cipher challenges."),
    ("Mega Menu", "menu.innovation.name", "Open Innovation"),
    ("Mega Menu", "menu.innovation.desc", "Pitching clean energy & healthcare tech."),

    # ── Why We Exist (Concept) ──────────────────────────────────────
    ("Why We Exist", "about.sub", "Our Purpose"),
    ("Why We Exist", "about.heading1", "Why"),
    ("Why We Exist", "about.heading2", "We"),
    ("Why We Exist", "about.heading3", "Exist"),
    ("Why We Exist", "about.lead", "Our Statement of Operation defines what we do, why you should support, and who reaps the rewards of young National Championship of Technology and Innovation Ecosystem."),
    ("Why We Exist", "about.card1.title", "Statement of Operation"),
    ("Why We Exist", "about.card1.body", "We build and run Ghana's premier National Technology and Innovation (NTI) Championship, integrating high-school teams from all 16 regions. Through rigorous coursework, sandbox tasks, and competitive arenas, we turn classrooms into innovation labs."),
    ("Why We Exist", "about.card1.link", "Experience the Tracks"),
    ("Why We Exist", "about.card2.badge", "Key Focus"),
    ("Why We Exist", "about.card2.title", "Why Support Champions?"),
    ("Why We Exist", "about.card2.body", "A thriving nation depends on scientific literacy and technical Innovations. Your support supplies physical robotics kits, funds regional travels, provides scholarships, and empowers students to build Technology careers and local solutions."),
    ("Why We Exist", "about.card2.link", "Sponsor Now"),
    ("Why We Exist", "about.card3.title", "Who Reaps the Rewards?"),
    ("Why We Exist", "about.card3.body", "The benefits ripple from the classroom to the nation. Students gain elite computational skills, educators receive certified modern training, local industries discover top-tier engineering talent, and Ghana accelerates its technological independence."),
    ("Why We Exist", "about.card3.link", "View Impact Metrics"),

    # ── News & Events ───────────────────────────────────────────────
    ("News & Events", "news.badge", "Latest"),
    ("News & Events", "news.viewAll", "View All Stories"),
    ("News & Events", "news.heading1", "News"),
    ("News & Events", "news.heading2", "&"),
    ("News & Events", "news.heading3", "Events"),
    ("News & Events", "news.desc", "Championship stories & updates -- how Ghana's next generation of scientists, developers, engineers, and innovators are building the future."),

    # ── Core Philosophy ─────────────────────────────────────────────
    ("Core Philosophy", "philosophy.sub", "Our Core Philosophy"),
    ("Core Philosophy", "philosophy.desc", "A glimpse into the real faces and moments that define our pursuit of excellence."),

    # ── Hall of Fame ────────────────────────────────────────────────
    ("Hall of Fame", "hof.sub", "Hall of Fame"),
    ("Hall of Fame", "hof.heading", "National Technology and Innovation Champions"),

    # ── Competition Tracks ──────────────────────────────────────────
    ("Competition Tracks", "tracks.sub", "The Technical Pillars"),
    ("Competition Tracks", "tracks.heading", "Competition Track Arenas"),
    ("Competition Tracks", "tracks.lead", "Click any track to see a live code preview. Each arena tests specific disciplines and demands deep practical application."),
    ("Competition Tracks", "tracks.coding.title", "Coding & Algorithms"),
    ("Competition Tracks", "tracks.coding.body", "Sprints in Python, C++, and Java. Tests data structures, algorithm optimization, and competitive speed-solving."),
    ("Competition Tracks", "tracks.coding.b1", "Speed & Accuracy challenge"),
    ("Competition Tracks", "tracks.coding.b2", "Computational Complexity limits"),
    ("Competition Tracks", "tracks.coding.b3", "Dynamic programming tests"),
    ("Competition Tracks", "tracks.robotics.title", "Robotics & IoT"),
    ("Competition Tracks", "tracks.robotics.body", "Navigating autonomous bots through agricultural and logistics tasks with sensors, actuators, and embedded boards."),
    ("Competition Tracks", "tracks.robotics.b1", "Lego EV3 & Arduino integrations"),
    ("Competition Tracks", "tracks.robotics.b2", "Real-world mapping algorithms"),
    ("Competition Tracks", "tracks.robotics.b3", "Sensor-actuator optimization"),
    ("Competition Tracks", "tracks.ai.title", "Artificial Intelligence"),
    ("Competition Tracks", "tracks.ai.body", "Train models to solve local agricultural, diagnostic, and climate problems using modern Machine Learning pipelines."),
    ("Competition Tracks", "tracks.ai.b1", "Crop disease computer vision"),
    ("Competition Tracks", "tracks.ai.b2", "Weather pattern neural networks"),
    ("Competition Tracks", "tracks.ai.b3", "Logistic routing prediction"),
    ("Competition Tracks", "tracks.cyber.title", "Networking & Cybersecurity CTF"),
    ("Competition Tracks", "tracks.cyber.body", "Capture the Flag sprints testing cryptographic decryption, network intrusion logs audit, and secure server builds."),
    ("Competition Tracks", "tracks.cyber.b1", "SQL Injection defense"),
    ("Competition Tracks", "tracks.cyber.b2", "Cipher decryption cycles"),
    ("Competition Tracks", "tracks.cyber.b3", "Sandboxed firewall setups"),
    ("Competition Tracks", "tracks.innovation.title", "Open Innovation"),
    ("Competition Tracks", "tracks.innovation.body", "Research, prototype, and pitch creative systems addressing healthcare, green power, and waste in Ghana."),
    ("Competition Tracks", "tracks.innovation.b1", "Renewable power generation"),
    ("Competition Tracks", "tracks.innovation.b2", "Public health data dashboards"),
    ("Competition Tracks", "tracks.innovation.b3", "Alumni & Sponsor pitches"),
    ("Competition Tracks", "tracks.previewCta", "Experience the Tracks"),

    # ── Coding Challenge ────────────────────────────────────────────
    ("Coding Challenge", "challenge.sub", "Daily Problem"),
    ("Coding Challenge", "challenge.heading", "Try Coding now"),
    ("Coding Challenge", "challenge.desc", "Pick a language, solve bite-sized challenges, and level up your skills. Hints included -- solutions revealed when you're stuck."),

    # ── Leaderboard ─────────────────────────────────────────────────
    ("Leaderboard", "leaderboard.sub", "Real-time Standing"),
    ("Leaderboard", "leaderboard.heading", "The Leaderboard"),
    ("Leaderboard", "leaderboard.desc", "Points aggregate dynamically as student squads complete courses, submit assignments, and compete in the track heats."),
    ("Leaderboard", "leaderboard.tabAll", "All Heats"),
    ("Leaderboard", "leaderboard.tabCoding", "Coding"),
    ("Leaderboard", "leaderboard.tabRobotics", "Robotics"),
    ("Leaderboard", "leaderboard.tabAi", "AI"),
    ("Leaderboard", "leaderboard.tabCyber", "Cyber"),
    ("Leaderboard", "leaderboard.status", "Live standings · Accredited by MoE & GES"),
    ("Leaderboard", "leaderboard.viewFull", "View Full Leaderboard (180+ Schools)"),

    # ── Impact Stats ────────────────────────────────────────────────
    ("Impact Stats", "stats.hub", "NTI Championship"),
    ("Impact Stats", "stats.hubSub", "2026 Impact"),
    ("Impact Stats", "stats.regions", "Regions Represented"),
    ("Impact Stats", "stats.mentors", "Certified Mentors"),
    ("Impact Stats", "stats.schools", "Schools Enrolled"),
    ("Impact Stats", "stats.students", "Active Students"),
    ("Impact Stats", "stats.projects", "NTI Championship Innovations"),
    ("Impact Stats", "stats.grants", "Scholarships & Grants"),

    # ── Region Map ──────────────────────────────────────────────────
    ("Region Map", "map.sub", "National Reach"),
    ("Region Map", "map.heading", "All 16 Regions Competing"),
    ("Region Map", "map.lead", "Hover over a region to see participating schools and top performers."),

    # ── Support a Champion ──────────────────────────────────────────
    ("Support a Champion", "support.sub", "Make an Impact"),
    ("Support a Champion", "support.heading", "Support a Champion"),
    ("Support a Champion", "support.lead", "Empower school squads, fund technical arenas, or share programmatic suggestions to help shape Ghana's technological frontier."),
    ("Support a Champion", "support.card1.title", "Inquire via Mail"),
    ("Support a Champion", "support.card1.body", "Send institutional correspondence, coordinate equipment deliveries, or mail donation checks directly to our central coordination registry."),
    ("Support a Champion", "support.card1.link", "Get Mail Details"),
    ("Support a Champion", "support.card2.title", "Sponsor a Team"),
    ("Support a Champion", "support.card2.body", "Directly fund microcontrollers, sensor kits, and laptop devices for high-need school squads preparing for active tracks."),
    ("Support a Champion", "support.card2.link", "Sponsor a Squad"),
    ("Support a Champion", "support.card3.title", "Sponsor Competition"),
    ("Support a Champion", "support.card3.body", "Partner with us as a corporate or individual underwriter for regional qualifier events and the national grand final arena."),
    ("Support a Champion", "support.card3.link", "Sponsor Events"),
    ("Support a Champion", "support.card4.title", "Submit Suggestions"),
    ("Support a Champion", "support.card4.body", "Share syllabus advice, volunteer offers, or platform feedback with our academic committee to guide our roadmap."),
    ("Support a Champion", "support.card4.link", "Submit Ideas"),

    # ── Login Gateway ───────────────────────────────────────────────
    ("Login Gateway", "gateway.badge", "Accredited Portal v2.0"),
    ("Login Gateway", "gateway.heading", "NTI Championship Gateway"),
    ("Login Gateway", "gateway.desc", "Enter your institutional credentials below. The system will automatically identify your role and route you to the appropriate workspace."),

    # ── Footer ──────────────────────────────────────────────────────
    ("Footer", "footer.heading", "National Technology and Innovation Championship"),
    ("Footer", "footer.sub", "Accredited School Competition Platform of the Republic of Ghana"),
    ("Footer", "footer.brief", "Designed to replicate the scholastic integrity of top-tier academic systems, enabling students to construct pathways from local innovation to global engineering programs."),
    ("Footer", "footer.contact", "Contact: info@ntic.gov.gh"),
    ("Footer", "footer.hotline", "Hotline: +233 (0) 302 999 888"),
    ("Footer", "footer.col1.title", "Competition Info"),
    ("Footer", "footer.col2.title", "Portals"),
    ("Footer", "footer.col3.title", "Legal & Admin"),
    ("Footer", "footer.copyright", "© 2026 @Qliq_Integrations. All rights reserved."),
]


def default_copy() -> dict:
    """Return a flat {key: value} map of the defaults, for seeding/fallback."""
    return {key: value for (_section, key, value) in LANDING_COPY_DEFAULTS}
