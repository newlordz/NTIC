import { Component, OnInit, AfterViewInit, OnDestroy, NgZone, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { ContentService } from '../../services/content.service';

interface UserRole {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultEmail: string;
}

interface Slide {
  tag: string;
  title: string;
  description: string;
  image: string;
  video: string | null;
  isVideoEdit?: boolean;
  videoEditImages?: string[];
  ctaText: string;
  ctaLink: string;
}

interface LeaderboardEntry {
  rank: string;
  schoolName: string;
  location: string;
  points: number;
  trackPoints: {
    all: number;
    coding: number;
    robotics: number;
    ai: number;
    cyber: number;
  };
  region: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DecimalPipe],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('matrixCanvas') matrixCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewFrame') previewFrameRef!: ElementRef<HTMLIFrameElement>;
  private cardListeners: { card: HTMLElement; mouseMove: any; mouseLeave: any }[] = [];
  roles: UserRole[] = [
    {
      id: 'student',
      name: 'Student Portal',
      icon: 'school',
      description: 'Access courses, submit assignments, and compete in active tracks.',
      defaultEmail: ''
    },
    {
      id: 'instructor',
      name: 'Instructor Portal',
      icon: 'patient_list',
      description: 'Manage teams, assess submissions, and mentor student projects.',
      defaultEmail: ''
    },
    {
      id: 'school_admin',
      name: 'School Admin Portal',
      icon: 'domain',
      description: 'Register your school, manage teams, and view institutional analytics.',
      defaultEmail: ''
    },
    {
      id: 'judge',
      name: 'Judge Portal',
      icon: 'gavel',
      description: 'Evaluate projects, score competition rounds, and publish rankings.',
      defaultEmail: ''
    },
    {
      id: 'sponsor',
      name: 'Sponsor Portal',
      icon: 'handshake',
      description: 'Track corporate impact, monitor CSR statistics, and follow talent.',
      defaultEmail: ''
    },
  ];

  activeRoleId = '';
  email = '';
  password = '';
  isLoggingIn = false;
  loginError = '';
  isPasswordVisible = false;
  detectedRoleName = '';

  get isAdminEmail(): boolean {
    return this.email.trim().toLowerCase() === 'admin@ntic.org.gh';
  }

  getWindSpeed(): number {
    const kw = parseFloat(this.arenaState.innovation?.windKw || '14.2');
    const speed = 3.5 - (kw - 10) * 0.15;
    return Math.max(0.4, Math.min(3.5, speed));
  }

  getAgeRange(people: any[]): string {
    if (!people || people.length === 0) return '—';
    const ages = people.map((p: any) => p.age);
    return Math.min(...ages) + ' – ' + Math.max(...ages) + ' yrs';
  }

  countMales(people: any[]): number {
    return people ? people.filter((p: any) => p.gender === 'male').length : 0;
  }

  countFemales(people: any[]): number {
    return people ? people.filter((p: any) => p.gender === 'female').length : 0;
  }

  getLossBarWidth(loss: string): number {
    const val = parseFloat(loss || '2.3026');
    return Math.min(100, Math.max(0, (2.3026 - val) / 2.3026 * 100));
  }

  parseNum(val: string): number {
    return parseInt(val) || 0;
  }

  // Harvard-style interactive states
  isMobileMenuOpen = false;
  activeMegaMenu: string | null = null;
  activeSlideIndex = 0;
  slideInterval: any;
  activeVideoEditImageIndex = 0;
  videoEditInterval: any;
  image1Url = '';
  image2Url = '';
  activeFrame = 1;
  isTransitioning = false;
  private heroObserver: any;
  private spotlightObserver: any;
  private tracksObserver: any;
  private scoreboardObserver: any;
  private statsObserver: any;
  private conceptObserver: any;
  private supportObserver: any;
  private scrollAnimObserver: any;
  private isHeroVisible = true;

  // Interactive Stats Tree variables
  regionsCount = 0;
  mentorsCount = 0;
  schoolsCount = 0;
  studentsCount = 0;
  projectsCount = 0;
  grantsCount = 0;
  statsAnimated = false;
  hoveredNode: string | null = null;

  // ── COUNTDOWN CLOCK ──────────────────────────────────────────
  countdownDays = 0;
  countdownHours = 0;
  countdownMins = 0;
  countdownSecs = 0;
  countdownTick = false;
  private countdownInterval: any;
  get competitionDate(): Date {
    return new Date(this.contentService.countdownDate || '2026-08-15T09:00:00');
  }


  isLoginModalOpen = false;

  openLoginModal(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isLoginModalOpen = true;
    this.email = '';
    this.password = '';
    this.loginError = '';
    this.detectedRoleName = '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      this.telemetryLogs = [
        `SECURE ACCESS PORTAL READY`,
        `SYSTEM INTEGRITY: ACCREDITED`,
        `AWAITING OPERATOR INPUT...`
      ];
    }
  }

  closeLoginModal(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isLoginModalOpen = false;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  selectRoleAndOpen(roleId: string, event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    this.openLoginModal();
  }

  // ── STRIPE HERO CANVAS (RADIAL BEAMS & PARTICLE STARBURST) ───
  private matrixAnimFrame: number | null = null;
  private matrixResizeListener: any;
  private matrixMouseListener: any;
  private matrixTouchListener: any;
  private matrixClickListener: any;
  private stripeMouseX: number = 0;
  private stripeMouseY: number = 0;
  private stripeTargetMouseX: number = 0;
  private stripeTargetMouseY: number = 0;

  // ── FLOATING FAB ─────────────────────────────────────────────
  fabVisible = false;
  private fabScrollListener: any;

  // ── TRACK CODE PREVIEW & ARENA SIMULATION ─────────────────────
  activeTrackPreview: string | null = null;
  typedCodePreview = '';
  isTrackModalOpen = false;
  private codeTypeInterval: any;
  private arenaInterval: any;

  trackCodeLabels: any = {
    coding:     'solution.py',
    robotics:   'robot_nav.ino',
    ai:         'train_model.py',
    cyber:      'ctf_exploit.sh',
    innovation: 'dashboard.jsx'
  };

  trackModalTitles: any = {
    coding:     'Coding & Algorithms — Speed Sprints Arena',
    robotics:   'Robotics & IoT — Autonomous Navigation Lab',
    ai:         'Artificial Intelligence — Neural Vision Studio',
    cyber:      'Cybersecurity CTF — Intrusion Defense Matrix',
    innovation: 'Open Innovation — Smart City Green Tech Grid'
  };

  trackModalSubtitles: any = {
    coding:     'Live computational benchmark & dynamic programming execution engine',
    robotics:   'Real-time ultrasonic obstacle avoidance & sensor telemetry radar',
    ai:         'Convolutional neural network diagnostic inference on agricultural crops',
    cyber:      'Sandboxed firewall log analyzer and cryptographic decryption stream',
    innovation: 'IoT renewable power distribution and environmental impact dashboard'
  };

  private autopilotTimers: any[] = [];

  arenaState: any = {
    robotics: {
      distance: 24,
      angle: 45,
      motorSpeed: 85,
      mode: 'Autonomous',
      radarSweep: 0,
      posX: 50,
      posY: 50,
      obstacleX: 25,
      obstacleY: 35,
      obstacleStatus: 'Target Stone',
      missionSuccess: false,
      clawOpen: false,
      cargo: 'None',
      status: 'RADAR SCANNING • PATH CLEAR',
      statusColor: '#00e676',
      log: 'Ultrasonic echo return: 24cm. Proceeding forward at 85% RPM.'
    },
    coding: {
      benchmarkMs: '0.38',
      memory: '14.2 MB',
      opsSec: '2.4M ops/s',
      people: [
        { id: 1, name: 'Kojo Mensah', age: 17, gender: 'male', initials: 'KM' },
        { id: 2, name: 'Ama Serwaa', age: 15, gender: 'female', initials: 'AS' },
        { id: 3, name: 'Yaw Boateng', age: 19, gender: 'male', initials: 'YB' },
        { id: 4, name: 'Efua Donkor', age: 14, gender: 'female', initials: 'ED' },
        { id: 5, name: 'Kwame Asante', age: 16, gender: 'male', initials: 'KW' },
        { id: 6, name: 'Adwoa Gyasi', age: 18, gender: 'female', initials: 'AG' },
        { id: 7, name: 'Kofi Nyarko', age: 20, gender: 'male', initials: 'KN' },
        { id: 8, name: 'Yaa Akoto', age: 13, gender: 'female', initials: 'YA' },
        { id: 9, name: 'Kwesi Arthur', age: 12, gender: 'male', initials: 'AR' },
        { id: 10, name: 'Abena Osei', age: 16, gender: 'female', initials: 'AO' },
      ].sort(() => Math.random() - 0.5),
      sortField: 'none',
      status: '// People grid loaded. Choose a sort method below.',
      statusColor: '#38bdf8',
      log: '> 10 contestants registered. Ready to sort.',
      code: `const people = [
  { name: 'Kojo', age: 17, gender: 'M' },
  { name: 'Ama',  age: 15, gender: 'F' },
  { name: 'Yaw',  age: 19, gender: 'M' },
  { name: 'Efua', age: 14, gender: 'F' },
  { name: 'Kwame',age: 16, gender: 'M' },
  { name: 'Adwoa',age: 18, gender: 'F' },
  { name: 'Kofi', age: 20, gender: 'M' },
  { name: 'Yaa',  age: 13, gender: 'F' },
  { name: 'Kwesi',age: 12, gender: 'M' },
  { name: 'Abena',age: 16, gender: 'F' },
];

// Pick a sorting strategy below:`
    },
    ai: {
      confidence: 98.4,
      epoch: 0,
      loss: '2.3026',
      accuracy: 0,
      label: 'Cocoa Pod • Healthy (Class 0)',
      sampleIcon: '🌿',
      sampleName: 'Cocoa Pod',
      gpuLoad: '74%',
      status: '⚡ MODEL INITIALIZED — Ready for training',
      statusColor: '#ab47bc',
      log: 'ResNet-50 loaded with random weights. Select a crop or start training.',
      confusionMatrix: [
        [25, 25, 25, 25],
        [25, 25, 25, 25],
        [25, 25, 25, 25],
        [25, 25, 25, 25]
      ],
      classLabels: ['Cocoa', 'Maize', 'Potato', 'Tomato'],
      classPrecision: ['—', '—', '—', '—'],
      classRecall: ['—', '—', '—', '—'],
      classF1: ['—', '—', '—', '—']
    },
    cyber: {
      packetsSec: 4250,
      encryption: 'AES-256-GCM',
      blockedCount: 18,
      firewall: '100% SECURE',
      status: 'INTRUSION ATTEMPT BLOCKED ON PORT 443',
      statusColor: '#ff1744',
      log: 'ROT13 cipher decoded -> SHA-256 integrity hash verified.'
    },
    innovation: {
      solarKw: '46.8',
      windKw: '14.2',
      battery: 94,
      co2Saved: 1280,
      efficiency: '98.5%',
      hospitalPower: 'Normal (100%)',
      status: 'IOT SMART GRID SYNCHRONIZED',
      statusColor: '#00a86b',
      log: '16 regional municipal IoT nodes transmitting live solar telemetry.'
    }
  };

    private trackCodeSnippets: any = {
    coding: `# NTIC Coding Track — Dynamic Programming\n# Problem: Longest Common Subsequence\n\ndef lcs(s1: str, s2: str) -> int:\n    m, n = len(s1), len(s2)\n    dp = [[0]*(n+1) for _ in range(m+1)]\n    for i in range(1, m+1):\n        for j in range(1, n+1):\n            if s1[i-1] == s2[j-1]:\n                dp[i][j] = dp[i-1][j-1] + 1\n            else:\n                dp[i][j] = max(dp[i-1][j], dp[i][j-1])\n    return dp[m][n]\n\nprint(lcs("ABCBDAB", "BDCAB"))  # → 4`,
    robotics: `// NTIC Robotics — Autonomous Navigation\n// Arduino: Ultrasonic obstacle avoidance\n\n#include <Servo.h>\nconst int TRIG=9, ECHO=10;\n\nvoid setup() {\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n}\n\nlong readDist() {\n  digitalWrite(TRIG, HIGH); delayMicroseconds(10);\n  return pulseIn(ECHO, HIGH) * 0.034 / 2;\n}\n\nvoid loop() {\n  long d = readDist();\n  if (d < 20) spinRight(400);\n  else        moveForward();\n}`,
    ai: `# NTIC AI Track — Crop Disease Classifier\nimport torch, torch.nn as nn\nfrom torchvision import models, transforms\n\ntransform = transforms.Compose([\n    transforms.Resize((224, 224)),\n    transforms.ToTensor(),\n    transforms.Normalize([0.485,0.456,0.406],\n                         [0.229,0.224,0.225])\n])\n\nmodel = models.resnet18(pretrained=True)\nmodel.fc = nn.Linear(512, 4)  # 4 disease classes\noptimizer = torch.optim.Adam(\n    model.parameters(), lr=1e-4)`,
    cyber: `#!/bin/bash\n# NTIC CTF — Cipher Decryption\nENCODED="Tnun_2026_PGS_synt"\n\n# Step 1: ROT13 decode\nROT13=$(echo "$ENCODED" | \\\n  tr 'A-Za-z' 'N-ZA-Mn-za-m')\necho "[ROT13] $ROT13"\n\n# Submit via netcat:\nnc ctf.ntic.gov.gh 4444 \\\n  <<< "NTIC{$ROT13}"`,
    innovation: `// NTIC Innovation — Solar Dashboard\nimport { useState, useEffect } from 'react';\n\nexport default function SolarDashboard() {\n  const [kw, setKw] = useState(0);\n\n  useEffect(() => {\n    const ws = new WebSocket(\n      'wss://iot.ntic.gov.gh/solar');\n    ws.onmessage = ({ data }) =>\n      setKw(JSON.parse(data).kw);\n    return () => ws.close();\n  }, []);\n\n  return <h2>⚡ {kw} kW Generated</h2>;\n}`
  };

  // ── CODING CHALLENGE WIDGET ───────────────────────────────────
  challengeLanguages = ['HTML/CSS', 'Python', 'JavaScript', 'C++'];
  selectedChallengeLanguage = 'HTML/CSS';
  showSolution = false;

  challengesByLanguage: { [key: string]: any[] } = {
    Python: [
      {
        title: 'hello.py', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 720, successRate: 98, points: 10,
        problem: 'Print the words "Hello World" to the screen.',
        hint: 'Use the print() function: print("Hello World")',
        solution: 'print("Hello World")',
        validator: (code: string) => /print/.test(code) && /hello|Hello/i.test(code)
      },
      {
        title: 'name.py', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 680, successRate: 96, points: 10,
        problem: 'Create a variable called name with your name, then print it.',
        hint: 'Use name = "YourName" then print(name)',
        solution: 'name = "Ghana"\nprint(name)',
        validator: (code: string) => /name\s*=/.test(code) && /print/.test(code)
      },
      {
        title: 'add.py', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 650, successRate: 95, points: 15,
        problem: 'Add two numbers (5 and 3) together and print the result.',
        hint: 'Use print(5 + 3) or make variables: a = 5, b = 3, print(a + b)',
        solution: 'a = 5\nb = 3\nprint(a + b)',
        validator: (code: string) => /\+\s*/.test(code) && /print/.test(code) && /[53]/.test(code)
      },
      {
        title: 'color.py', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 610, successRate: 93, points: 15,
        problem: 'Print "My favorite color is blue" using a variable called color.',
        hint: 'Set color = "blue" then use print("My favorite color is", color)',
        solution: 'color = "blue"\nprint("My favorite color is", color)',
        validator: (code: string) => /color\s*=/.test(code) && /print/.test(code) && /blue/i.test(code)
      },
      {
        title: 'loop.py', track: 'Coding', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 550, successRate: 88, points: 25,
        problem: 'Use a for loop to print numbers 1 to 5, each on a new line.',
        hint: 'Use: for i in range(1, 6): print(i)',
        solution: 'for i in range(1, 6):\n    print(i)',
        validator: (code: string) => /for/.test(code) && /range/.test(code) && /print/.test(code)
      },
      {
        title: 'if.py', track: 'Coding', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 490, successRate: 84, points: 25,
        problem: 'Set a variable age to 10. If age is greater than 5, print "Big kid!".',
        hint: 'Use: age = 10\nif age > 5: print("Big kid!")',
        solution: 'age = 10\nif age > 5:\n    print("Big kid!")',
        validator: (code: string) => /if/.test(code) && /print/.test(code) && />/.test(code)
      }
    ],
    JavaScript: [
      {
        title: 'hello.js', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 700, successRate: 97, points: 10,
        problem: 'Print "Hello World" to the console.',
        hint: 'Use console.log("Hello World")',
        solution: 'console.log("Hello World");',
        validator: (code: string) => /console\.log/.test(code) && /hello|Hello/i.test(code)
      },
      {
        title: 'greet.js', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 650, successRate: 95, points: 10,
        problem: 'Create a variable called name and print "Hello" + name.',
        hint: 'Use let name = "Kofi"; then console.log("Hello " + name);',
        solution: 'let name = "Kofi";\nconsole.log("Hello " + name);',
        validator: (code: string) => /let\s+name|var\s+name|const\s+name/.test(code) && /console\.log/.test(code)
      },
      {
        title: 'add.js', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 620, successRate: 94, points: 15,
        problem: 'Add two numbers (5 and 3) and show the result with console.log.',
        hint: 'Use console.log(5 + 3); or make variables first.',
        solution: 'let x = 5;\nlet y = 3;\nconsole.log(x + y);',
        validator: (code: string) => /console\.log/.test(code) && /\+\s*/.test(code)
      },
      {
        title: 'alert.js', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 590, successRate: 92, points: 15,
        problem: 'Show a popup alert that says "Welcome to Coding!".',
        hint: 'Use alert("Welcome to Coding!");',
        solution: 'alert("Welcome to Coding!");',
        validator: (code: string) => /alert/.test(code) && /welcome|Welcome/i.test(code)
      },
      {
        title: 'loop.js', track: 'Coding', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 510, successRate: 85, points: 25,
        problem: 'Use a for loop to print numbers 1 to 5 in the console.',
        hint: 'Use: for (let i = 1; i <= 5; i++) { console.log(i); }',
        solution: 'for (let i = 1; i <= 5; i++) {\n  console.log(i);\n}',
        validator: (code: string) => /for/.test(code) && /console\.log/.test(code) && /\+\+|i\+\+|i\s*=\s*i\s*\+\s*1|i\s*\+=/.test(code)
      },
      {
        title: 'if.js', track: 'Coding', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 460, successRate: 80, points: 25,
        problem: 'Set a variable age to 10. If age is greater than 5, show an alert.',
        hint: 'Use: let age = 10;\nif (age > 5) { alert("Big kid!"); }',
        solution: 'let age = 10;\nif (age > 5) {\n  alert("Big kid!");\n}',
        validator: (code: string) => /if/.test(code) && /alert/.test(code) && />/.test(code)
      }
    ],
    'C++': [
      {
        title: 'hello.cpp', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 600, successRate: 95, points: 10,
        problem: 'Print "Hello World" using cout.',
        hint: 'Use: cout << "Hello World"; (include iostream and use std::cout or using namespace std)',
        solution: '#include <iostream>\nusing namespace std;\nint main() {\n  cout << "Hello World";\n  return 0;\n}',
        validator: (code: string) => /cout/.test(code) && /hello|Hello/i.test(code) && /int\s+main/.test(code)
      },
      {
        title: 'name.cpp', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 550, successRate: 93, points: 10,
        problem: 'Make a variable called name and print it with cout.',
        hint: 'Use: string name = "Akua"; cout << name;',
        solution: '#include <iostream>\n#include <string>\nusing namespace std;\nint main() {\n  string name = "Akua";\n  cout << name;\n  return 0;\n}',
        validator: (code: string) => /string\s+\w+\s*=/.test(code) && /cout/.test(code) && /int\s+main/.test(code)
      },
      {
        title: 'add.cpp', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 520, successRate: 91, points: 15,
        problem: 'Add 5 and 3 and print the result using cout.',
        hint: 'Use: cout << 5 + 3; or make int variables and add them.',
        solution: '#include <iostream>\nusing namespace std;\nint main() {\n  int x = 5, y = 3;\n  cout << x + y;\n  return 0;\n}',
        validator: (code: string) => /cout/.test(code) && /int/.test(code) && /\+/.test(code) && /main/.test(code)
      },
      {
        title: 'age.cpp', track: 'Coding', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 480, successRate: 89, points: 15,
        problem: 'Create an int variable called age with value 10, then print "I am " and the age.',
        hint: 'Use: int age = 10; cout << "I am " << age;',
        solution: '#include <iostream>\nusing namespace std;\nint main() {\n  int age = 10;\n  cout << "I am " << age;\n  return 0;\n}',
        validator: (code: string) => /int\s+age\s*=\s*10/.test(code) && /cout/.test(code) && /main/.test(code)
      },
      {
        title: 'loop.cpp', track: 'Coding', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 410, successRate: 82, points: 25,
        problem: 'Use a for loop to print numbers 1 to 5, each on a new line (use endl).',
        hint: 'Use: for (int i = 1; i <= 5; i++) { cout << i << endl; }',
        solution: '#include <iostream>\nusing namespace std;\nint main() {\n  for (int i = 1; i <= 5; i++) {\n    cout << i << endl;\n  }\n  return 0;\n}',
        validator: (code: string) => /for/.test(code) && /cout/.test(code) && /endl/.test(code) && /main/.test(code)
      },
      {
        title: 'if.cpp', track: 'Coding', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 370, successRate: 78, points: 25,
        problem: 'Set int age = 10. If age is greater than 5, print "Big kid!" using cout.',
        hint: 'Use: if (age > 5) { cout << "Big kid!"; }',
        solution: '#include <iostream>\nusing namespace std;\nint main() {\n  int age = 10;\n  if (age > 5) {\n    cout << "Big kid!";\n  }\n  return 0;\n}',
        validator: (code: string) => /if/.test(code) && /cout/.test(code) && />/.test(code) && /main/.test(code)
      }
    ],
    'HTML/CSS': [
      {
        title: 'header.html', track: 'Frontend', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 640, successRate: 96, points: 10,
        problem: 'Create a heading that says "Hello" and make the text color blue.',
        hint: 'Use <h1>Hello</h1> and add style="color: blue;" to the heading tag.',
        solution: '<!DOCTYPE html>\n<html>\n<body>\n  <h1 style="color: blue;">Hello</h1>\n</body>\n</html>',
        validator: (code: string) => /h1/.test(code) && /color\s*:\s*blue|#0000ff|#00f/i.test(code) && /hello/i.test(code)
      },
      {
        title: 'paragraph.html', track: 'Frontend', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 600, successRate: 94, points: 10,
        problem: 'Create a paragraph with the text "I love coding" and make the text color red.',
        hint: 'Use <p>I love coding</p> with style="color: red;" inside the tag.',
        solution: '<!DOCTYPE html>\n<html>\n<body>\n  <p style="color: red;">I love coding</p>\n</body>\n</html>',
        validator: (code: string) => /<p/.test(code) && /color\s*:\s*red|#ff0000|#f00/i.test(code) && /love/i.test(code)
      },
      {
        title: 'background.html', track: 'Frontend', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 570, successRate: 92, points: 15,
        problem: 'Change the background color of the page to yellow.\nUse the body tag with a style.',
        hint: 'Add style="background: yellow;" to the <body> tag.',
        solution: '<!DOCTYPE html>\n<html>\n<body style="background: yellow;">\n  <h1>Sunny Day!</h1>\n</body>\n</html>',
        validator: (code: string) => /body/.test(code) && /background\s*:\s*yellow|#ffff00|#ff0/i.test(code)
      },
      {
        title: 'bigtext.html', track: 'Frontend', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 540, successRate: 90, points: 15,
        problem: 'Make some text very big! Set font-size to 50px on a paragraph.',
        hint: 'Use <p style="font-size: 50px;">Big text</p>',
        solution: '<!DOCTYPE html>\n<html>\n<body>\n  <p style="font-size: 50px;">This is big!</p>\n</body>\n</html>',
        validator: (code: string) => /font-size\s*:\s*50/.test(code) && /<p/.test(code)
      },
      {
        title: 'center.html', track: 'Frontend', difficulty: 'Very Easy',
        timeLimit: '5 min', solvedCount: 510, successRate: 88, points: 20,
        problem: 'Center a heading on the page using text-align.',
        hint: 'Use <h1 style="text-align: center;">Centered</h1>',
        solution: '<!DOCTYPE html>\n<html>\n<body>\n  <h1 style="text-align: center;">Centered Title</h1>\n</body>\n</html>',
        validator: (code: string) => /text-align\s*:\s*center/.test(code) && /h1/.test(code)
      },
      {
        title: 'border.html', track: 'Frontend', difficulty: 'Easy',
        timeLimit: '8 min', solvedCount: 460, successRate: 83, points: 25,
        problem: 'Make a box with a black border around it.\nCreate a div and give it a border.',
        hint: 'Use <div style="border: 2px solid black; padding: 20px;">Hello</div>',
        solution: '<!DOCTYPE html>\n<html>\n<body>\n  <div style="border: 2px solid black; padding: 20px;">Hello</div>\n</body>\n</html>',
        validator: (code: string) => /border\s*:\s*.+solid/.test(code) && /div/.test(code)
      }
    ]
  };

  get filteredChallenges(): any[] {
    return this.challengesByLanguage[this.selectedChallengeLanguage] || [];
  }

  currentChallengeIndex = 0;
  get currentChallenge() {
    const list = this.filteredChallenges;
    return list[this.currentChallengeIndex % list.length] || list[0];
  }
  get currentSolution(): string {
    return this.currentChallenge?.solution || '';
  }

  selectLanguage(lang: string): void {
    this.selectedChallengeLanguage = lang;
    this.currentChallengeIndex = 0;
    this.showSolution = false;
    this.typeProblem();
  }
  typedProblem = '';
  userCode = '';
  codeLineNumbers = [1, 2, 3, 4, 5, 6];
  challengeResult: boolean | null = null;
  challengeResultMessage = '';
  isChallengeRunning = false;
  hintVisible = false;
  sessionSolvedToday = 0;
  sessionPoints = 0;
  showPreviewModal = false;
  private problemTypeInterval: any;

  // ── GHANA REGION MAP ──────────────────────────────────────────
  private _lastUsersJson = '';
  private _lastStatsSchools = -1;
  private _cachedRegionDataList: any[] = [];

  hoveredRegionData: any = null;
  selectedRegion: string | null = null;

  get regionDataList(): any[] {
    const isWiped = this.contentService.platformStats.schools === 0;
    const usersJson = JSON.stringify(this.contentService.users);
    const statsSchools = this.contentService.platformStats.schools;

    if (this._cachedRegionDataList.length > 0 && 
        this._lastStatsSchools === statsSchools && 
        this._lastUsersJson === usersJson) {
      return this._cachedRegionDataList;
    }

    this._lastStatsSchools = statsSchools;
    this._lastUsersJson = usersJson;

    const regions = [
      { id: 'greater-accra', name: 'Greater Accra', defaultCount: 42, topSchool: 'PRESEC Legon', specialty: 'Coding & AI' },
      { id: 'ashanti',       name: 'Ashanti',       defaultCount: 38, topSchool: 'Prempeh College', specialty: 'Robotics' },
      { id: 'central',       name: 'Central',       defaultCount: 22, topSchool: "Wesley Girls' HS", specialty: 'Coding' },
      { id: 'eastern',       name: 'Eastern',       defaultCount: 18, topSchool: 'Koforidua SHTS', specialty: 'AI' },
      { id: 'western',       name: 'Western',       defaultCount: 15, topSchool: 'Fijai SHS', specialty: 'Innovation' },
      { id: 'volta',         name: 'Volta',         defaultCount: 12, topSchool: 'Ho Technical', specialty: 'Cybersecurity' },
      { id: 'northern',      name: 'Northern',      defaultCount: 10, topSchool: 'Tamale SHS', specialty: 'Robotics' },
      { id: 'bono',          name: 'Bono',          defaultCount: 8,  topSchool: 'Sunyani SHS', specialty: 'Coding' },
      { id: 'western-north', name: 'Western North', defaultCount: 6,  topSchool: 'Sefwi Wiawso SHS', specialty: 'Innovation' },
      { id: 'bono-east',     name: 'Bono East',     defaultCount: 7,  topSchool: 'Techiman SHS', specialty: 'AI' },
      { id: 'ahafo',         name: 'Ahafo',         defaultCount: 5,  topSchool: 'Goaso SHS', specialty: 'Innovation' },
      { id: 'oti',           name: 'Oti',           defaultCount: 4,  topSchool: 'Nkwanta SHS', specialty: 'Coding' },
      { id: 'savannah',      name: 'Savannah',      defaultCount: 5,  topSchool: 'Damongo SHS', specialty: 'Robotics' },
      { id: 'north-east',    name: 'North East',    defaultCount: 4,  topSchool: 'Nalerigu SHS', specialty: 'AI' },
      { id: 'upper-west',    name: 'Upper West',    defaultCount: 5,  topSchool: 'Wa SHS', specialty: 'Coding' },
      { id: 'upper-east',    name: 'Upper East',    defaultCount: 6,  topSchool: 'Navrongo SHS', specialty: 'Cybersecurity' },
    ];

    if (isWiped) {
      this._cachedRegionDataList = regions.map(r => ({
        id: r.id,
        name: r.name,
        schools: 0,
        topSchool: 'None',
        specialty: 'Not assigned'
      }));
    } else {
      this._cachedRegionDataList = regions.map(r => {
        const realSchools = this.contentService.users.filter(u => 
          u.role === 'school_admin' && 
          u.organization && 
          this.getRegionForSchool(u.organization) === r.id
        ).length;

        return {
          id: r.id,
          name: r.name,
          schools: realSchools,
          topSchool: realSchools > 0 ? r.topSchool : 'None',
          specialty: r.specialty
        };
      });
    }

    return this._cachedRegionDataList;
  }

  private getRegionForSchool(schoolName: string): string {
    const name = schoolName.toLowerCase();
    if (name.includes('presec') || name.includes('achimota') || name.includes('legon')) return 'greater-accra';
    if (name.includes('prempeh') || name.includes('knust') || name.includes('ashanti')) return 'ashanti';
    if (name.includes('wesley') || name.includes('holy child') || name.includes('central')) return 'central';
    if (name.includes('koforidua') || name.includes('eastern')) return 'eastern';
    if (name.includes('fijai') || name.includes('western')) return 'western';
    if (name.includes('ho ') || name.includes('volta')) return 'volta';
    if (name.includes('tamale') || name.includes('northern')) return 'northern';
    if (name.includes('sunyani') || name.includes('bono')) return 'bono';
    return 'greater-accra';
  }

  trackByRegionId(index: number, item: any): string {
    return item.id;
  }

  // Biometric Scan & Telemetry variables
  isScanning = false;
  telemetryLogs: string[] = [];
  private decryptInterval: any;
  private scanTimeout: any;
  private telemetryTimeouts: any[] = [];

  // Support a Champion interactive state
  isSupportModalOpen = false;
  activeSupportType: 'mail' | 'team' | 'competition' | 'suggestion' | null = null;
  supportForm = {
    name: '',
    email: '',
    subject: '',
    message: '',
    amount: 100,
    schoolName: 'Presbyterian Boys\' Sec. School (PRESEC)',
    competitionTier: 'regional'
  };
  supportSubmitted = false;

  slides: Slide[] = [
    {
      tag: 'National Championship',
      title: 'Where Ghana\'s Brightest Minds Compete & Innovate',
      description: 'Bringing together high school teams from all 16 regions to solve real-world problems through Coding, Robotics, AI, Cybersecurity, and Open Innovation.',
      image: 'assets/ntic_image_8.jpeg',
      video: 'assets/ntic_slideshow.mp4',
      isVideoEdit: false,
      videoEditImages: [],
      ctaText: 'Enter Portal',
      ctaLink: '#portal'
    }
  ];

  // Live Scoreboard Interactive stand state
  activeLeaderboardFilter = 'all';
  isLeaderboardTransitioning = false;

  leaderboardData: any[] = []; // kept for compatibility but not used directly — use contentService

  get filteredLeaderboard(): any[] {
    const filter = this.activeLeaderboardFilter;
    const sorted = [...this.contentService.leaderboardData].map(entry => {
      let pts = entry.trackPoints.all;
      if (filter === 'coding')   pts = entry.trackPoints.coding;
      else if (filter === 'robotics') pts = entry.trackPoints.robotics;
      else if (filter === 'ai')  pts = entry.trackPoints.ai;
      else if (filter === 'cyber') pts = entry.trackPoints.cyber;
      return { ...entry, displayPoints: pts };
    });
    sorted.sort((a, b) => b.displayPoints - a.displayPoints);
    return sorted.map((entry, index) => {
      const rankNum = index + 1;
      return { ...entry, displayRank: rankNum < 10 ? '0' + rankNum : '' + rankNum };
    });
  }

  changeLeaderboardFilter(filter: string): void {
    if (this.activeLeaderboardFilter === filter) return;
    this.isLeaderboardTransitioning = true;
    setTimeout(() => {
      this.activeLeaderboardFilter = filter;
      setTimeout(() => {
        this.isLeaderboardTransitioning = false;
      }, 100);
    }, 200);
  }

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private elementRef: ElementRef,
    public themeService: ThemeService,
    public contentService: ContentService,
    private renderer: Renderer2
  ) {
    this.activeRoleId = '';
    // Populate videoEditImages with all 48 photos in a shuffled order for organic variation
    const firstSlide = this.slides[0];
    if (firstSlide && firstSlide.isVideoEdit) {
      const paths = [];
      for (let i = 1; i <= 48; i++) {
        paths.push(`assets/ntic_image_${i}.jpeg`);
      }
      paths.sort(() => Math.random() - 0.5);
      firstSlide.videoEditImages = paths;
    }
  }

  clearAllData(): void {
    if (confirm('Are you sure you want to clear all data and start with a clean slate? This will reset all portals.')) {
      this.contentService.clearAllData();
      alert('All data wiped! You are now in a clean testing state.');
      window.location.reload();
    }
  }

  loadSampleData(): void {
    if (confirm('Are you sure you want to restore the original sample data? This will overwrite your current test inputs.')) {
      this.contentService.loadSampleData();
      alert('Sample data restored successfully!');
      window.location.reload();
    }
  }

  ngOnInit(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    // Pre-populate track preview with coding snippet (no modal popup on load)
    this.setTrackPreview('coding', false);

    this.startSlideShow();
    this.setupIntersectionObserver();
    this.setupSpotlightObserver();
    this.setupTracksObserver();
    this.setupScoreboardObserver();
    this.setupStatsObserver();
    this.setupConceptObserver();
    this.setupSupportObserver();
    this.preloadNextImages(0, 3);
    this.startCountdown();
    this.typeProblem();
    this.setupFabScroll();
  }

  ngAfterViewInit(): void {
    this.setupCardParallax();
    this.startMatrixRain();
    this.applyRegionColors();
    this.setupScrollAnimations();
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    this.stopSlideShow();
    this.stopVideoEditLoop();
    if (this.decryptInterval) clearInterval(this.decryptInterval);
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    this.telemetryTimeouts.forEach(t => clearTimeout(t));
    this.telemetryTimeouts = [];
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    if (this.matrixAnimFrame) cancelAnimationFrame(this.matrixAnimFrame);
    if (this.matrixResizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.matrixResizeListener);
    }
    if (this.matrixMouseListener && typeof window !== 'undefined') {
      window.removeEventListener('mousemove', this.matrixMouseListener);
    }
    if (this.matrixTouchListener && typeof window !== 'undefined') {
      window.removeEventListener('touchmove', this.matrixTouchListener);
    }
    if (this.matrixClickListener && this.matrixCanvasRef?.nativeElement) {
      this.matrixCanvasRef.nativeElement.removeEventListener('click', this.matrixClickListener);
    }
    if (this.codeTypeInterval) clearInterval(this.codeTypeInterval);
    if (this.arenaInterval) clearInterval(this.arenaInterval);
    if (this.problemTypeInterval) clearInterval(this.problemTypeInterval);
    if (this.fabScrollListener && typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.fabScrollListener);
    }
    if (this.heroObserver) this.heroObserver.disconnect();
    if (this.spotlightObserver) this.spotlightObserver.disconnect();
    if (this.tracksObserver) this.tracksObserver.disconnect();
    if (this.scoreboardObserver) this.scoreboardObserver.disconnect();
    if (this.statsObserver) this.statsObserver.disconnect();
    if (this.conceptObserver) this.conceptObserver.disconnect();
    if (this.supportObserver) this.supportObserver.disconnect();
    if (this.scrollAnimObserver) this.scrollAnimObserver.disconnect();
    this.cardListeners.forEach(item => {
      item.card.removeEventListener('mousemove', item.mouseMove);
      item.card.removeEventListener('mouseleave', item.mouseLeave);
    });
    this.cardListeners = [];
  }

  private preloadNextImages(currentIndex: number, count: number = 3): void {
    const currentSlide = this.slides[currentIndex];
    if (currentSlide && currentSlide.videoEditImages && currentSlide.videoEditImages.length > 0) {
      const images = currentSlide.videoEditImages;
      const total = images.length;
      this.ngZone.runOutsideAngular(() => {
        for (let i = 1; i <= count; i++) {
          const nextIdx = (currentIndex + i) % total;
          const img = new Image();
          img.src = images[nextIdx];
        }
      });
    }
  }

  private setupIntersectionObserver(): void {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const isVisible = entry.isIntersecting;
          if (this.isHeroVisible !== isVisible) {
            this.isHeroVisible = isVisible;
            if (isVisible) {
              this.ngZone.run(() => {
                this.startSlideShow();
                this.restartMatrixRain();
              });
            } else {
              this.ngZone.run(() => {
                this.stopSlideShow();
                this.stopVideoEditLoop();
              });
            }
          }
        });
      }, { threshold: 0.1 });
      
      const heroEl = this.elementRef.nativeElement.querySelector('.hero-section');
      if (heroEl) {
        this.heroObserver.observe(heroEl);
      }
    }
  }

  startSlideShow(): void {
    this.stopSlideShow();
    
    const currentSlide = this.slides[this.activeSlideIndex];
    
    if (currentSlide.isVideoEdit) {
      this.startVideoEditLoop();
    } else {
      this.stopVideoEditLoop();
    }

    // Play active slide video and pause inactive slide videos to save CPU/GPU resources
    setTimeout(() => {
      const videoElements = this.elementRef.nativeElement.querySelectorAll('.slide-item video') as NodeListOf<HTMLVideoElement>;
      videoElements.forEach((video) => {
        const slideItem = video.closest('.slide-item');
        if (slideItem && slideItem.classList.contains('active')) {
          video.play().catch(err => console.log('Video play failed', err));
        } else {
          video.pause();
        }
      });
    }, 50);
    
    if (this.slides.length > 1) {
      const duration = currentSlide.isVideoEdit ? 15000 : 10000;
      this.ngZone.runOutsideAngular(() => {
        this.slideInterval = setInterval(() => {
          this.ngZone.run(() => {
            this.nextSlide();
          });
        }, duration);
      });
    }
  }

  private setupScrollAnimations(): void {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.ngZone.runOutsideAngular(() => {
        this.scrollAnimObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              // Optionally unobserve if we only want it to animate once:
              // this.scrollAnimObserver.unobserve(entry.target);
            }
          });
        }, {
          threshold: 0.15,
          rootMargin: '0px 0px -50px 0px'
        });

        const elements = this.elementRef.nativeElement.querySelectorAll('.scroll-animate');
        elements.forEach((el: HTMLElement) => {
          this.scrollAnimObserver.observe(el);
        });
      });
    }
  }

  stopSlideShow(): void {
    if (this.slideInterval) {
      clearInterval(this.slideInterval);
    }
  }

  startVideoEditLoop(): void {
    this.stopVideoEditLoop();
    this.activeVideoEditImageIndex = 0;
    const currentSlide = this.slides[this.activeSlideIndex];

    if (currentSlide && currentSlide.videoEditImages && currentSlide.videoEditImages.length > 0) {
      this.image1Url = currentSlide.videoEditImages[0];
      this.image2Url = currentSlide.videoEditImages[0];
      this.activeFrame = 1;
    }

    const imgCount = currentSlide.videoEditImages ? currentSlide.videoEditImages.length : 1;
    const images = currentSlide.videoEditImages || [];

    this.ngZone.runOutsideAngular(() => {
      const slideItems = this.elementRef.nativeElement.querySelectorAll('.slide-item');
      const activeSlideEl = slideItems[this.activeSlideIndex];
      const container = activeSlideEl ? activeSlideEl.querySelector('.video-edit-container') : null;

      this.videoEditInterval = setInterval(() => {
        if (!images.length) return;
        this.activeVideoEditImageIndex = (this.activeVideoEditImageIndex + 1) % imgCount;
        const nextImg = images[this.activeVideoEditImageIndex];
        const gradient = 'linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.3) 100%), url(' + nextImg + ')';

        // Preload next image dynamically in the background
        const nextNextIdx = (this.activeVideoEditImageIndex + 1) % imgCount;
        const img = new Image();
        img.src = images[nextNextIdx];

        if (container) {
          const frames = (container as Element).querySelectorAll<HTMLElement>('.video-edit-frame');

          if (this.activeFrame === 1) {
            if (frames[1]) {
              frames[1].style.backgroundImage = gradient;
              frames[0].classList.remove('active');
              frames[1].classList.add('active');
            }
            this.activeFrame = 2;
          } else {
            if (frames[0]) {
              frames[0].style.backgroundImage = gradient;
              frames[1].classList.remove('active');
              frames[0].classList.add('active');
            }
            this.activeFrame = 1;
          }
        }
      }, 4500);
    });
  }

  stopVideoEditLoop(): void {
    if (this.videoEditInterval) {
      clearInterval(this.videoEditInterval);
    }
  }

  setSlide(index: number): void {
    this.activeSlideIndex = index;
    this.startSlideShow();
  }

  nextSlide(): void {
    this.activeSlideIndex = (this.activeSlideIndex + 1) % this.slides.length;
    this.startSlideShow();
  }

  prevSlide(): void {
    this.activeSlideIndex = (this.activeSlideIndex - 1 + this.slides.length) % this.slides.length;
    this.startSlideShow();
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    document.body.style.overflow = this.isMobileMenuOpen ? 'hidden' : '';
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  toggleMegaMenu(menu: string): void {
    if (this.activeMegaMenu === menu) {
      this.activeMegaMenu = null;
    } else {
      this.activeMegaMenu = menu;
    }
  }

  closeMegaMenu(): void {
    this.activeMegaMenu = null;
  }

  detectRoleFromInput(credential: string): void {
    if (!credential.trim()) {
      if (this.detectedRoleName) {
        this.detectedRoleName = '';
        this.telemetryLogs = [
          `SECURE ACCESS PORTAL READY`,
          `SYSTEM INTEGRITY: ACCREDITED`,
          `AWAITING OPERATOR INPUT...`
        ];
      }
      return;
    }
    const lookup = credential.trim().toLowerCase();
    const user = this.contentService.users.find(u =>
      u.email?.trim().toLowerCase() === lookup ||
      u.ticket?.trim().toLowerCase() === lookup
    );
    if (user) {
      const labels: Record<string, string> = {
        student: 'Student',
        instructor: 'Instructor',
        school_admin: 'School Admin',
        judge: 'Judge',
        sponsor: 'Sponsor',
        super_admin: 'Administrator'
      };
      const role = labels[user.role] || 'User';
      this.detectedRoleName = role;
      this.updateTelemetry(role);
    } else if (lookup === 'admin@ntic.org.gh') {
      this.detectedRoleName = 'Administrator';
      this.updateTelemetry('Administrator');
    } else {
      if (this.detectedRoleName) {
        this.detectedRoleName = '';
        this.telemetryLogs = [
          `SECURE ACCESS PORTAL READY`,
          `SYSTEM INTEGRITY: ACCREDITED`,
          `AWAITING OPERATOR INPUT...`
        ];
      }
    }
  }

  selectRole(roleId: string, animate: boolean = false): void {
    this.email = '';
    this.password = '';
    this.loginError = '';
    this.detectedRoleName = '';
    if (typeof window !== 'undefined') {
      this.telemetryLogs = [
        `SECURE ACCESS PORTAL READY`,
        `SYSTEM INTEGRITY: ACCREDITED`,
        `AWAITING OPERATOR INPUT...`
      ];
    }
  }

  triggerBiometricScan(): void {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
    }
    this.isScanning = true;
    this.scanTimeout = setTimeout(() => {
      this.isScanning = false;
    }, 1200);
  }

  decryptEmail(targetEmail: string): void {
    if (this.decryptInterval) {
      clearInterval(this.decryptInterval);
    }
    
    this.password = '••••••••••••';
    const emailInput = (this.elementRef.nativeElement.querySelector('#email') || this.elementRef.nativeElement.querySelector('#emailModal')) as HTMLInputElement;
    
    let currentIteration = 0;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789@._-';
    
    this.ngZone.runOutsideAngular(() => {
      this.decryptInterval = setInterval(() => {
        let tempEmail = '';
        for (let i = 0; i < targetEmail.length; i++) {
          if (i < currentIteration) {
            tempEmail += targetEmail[i];
          } else if (i === currentIteration) {
            tempEmail += chars[Math.floor(Math.random() * chars.length)];
          } else {
            tempEmail += Math.random() > 0.55 ? chars[Math.floor(Math.random() * chars.length)] : '';
          }
        }
        
        if (emailInput) {
          emailInput.value = tempEmail;
        }
        
        currentIteration++;
        if (currentIteration > targetEmail.length) {
          clearInterval(this.decryptInterval);
          this.decryptInterval = null;
          this.ngZone.run(() => {
            this.email = targetEmail;
            this.password = 'password123';
          });
        }
      }, 20);
    });
  }

  updateTelemetry(roleName: string): void {
    this.telemetryTimeouts.forEach(t => clearTimeout(t));
    this.telemetryTimeouts = [];
    this.telemetryLogs = [];
    
    const logs = [
      `SECURE LINK ROUTED`,
      `AUTHORIZING PRESET SIGNATURE...`,
      `ACCESS GRANTED TO: [${roleName.toUpperCase()}]`,
      `CREATING SECURE SESSION CONTEXT...`,
      `DECRYPTING INSTITUTIONAL IDENTITY...`
    ];
    
    logs.forEach((logLine, index) => {
      const timeout = setTimeout(() => {
        this.telemetryLogs.push(logLine);
      }, index * 180);
      this.telemetryTimeouts.push(timeout);
    });
  }

  get activeRole(): UserRole | null {
    return this.roles.find(r => r.id === this.activeRoleId) || null;
  }

  login(): void {
    this.isLoggingIn = true;
    this.loginError = '';
    this.detectedRoleName = '';

    setTimeout(() => {
      this.isLoggingIn = false;
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }

      const credential = this.email.trim().toLowerCase();
      const pass = this.password.trim();

      // Super admin bypass
      if (credential === 'admin@ntic.org.gh') {
        localStorage.setItem('activeRoleId', 'super_admin');
        localStorage.setItem('activeUserEmail', credential);
        this.contentService.saveAuditLogs([
          { action: 'Admin login: ' + credential, user: credential, time: 'Just now', type: 'auth' },
          ...this.contentService.auditLogs
        ]);
        this.router.navigate(['/dashboard']);
        return;
      }

      // Look up user by email or ticket
      const registeredUser = this.contentService.users.find(u =>
        (u.email?.trim().toLowerCase() === credential) ||
        (u.ticket?.trim().toLowerCase() === credential)
      );

      if (!registeredUser) {
        this.loginError = 'Unrecognized credentials. Please check your email or access pass and try again.';
        return;
      }

      // Verify password/OTP
      const expectedPass = registeredUser.otp || 'password123';
      if (pass !== expectedPass) {
        this.loginError = 'Incorrect password or verification code. Please try again.';
        return;
      }

      const finalRole = registeredUser.role;
      registeredUser.status = 'Active';
      registeredUser.lastLogin = 'Just now';
      this.contentService.saveUsers([...this.contentService.users]);

      localStorage.setItem('activeRoleId', finalRole);
      localStorage.setItem('activeUserEmail', credential);
      this.contentService.saveAuditLogs([
        { action: `${finalRole} login: ${credential}`, user: credential, time: 'Just now', type: 'auth' },
        ...this.contentService.auditLogs
      ]);

      const roleRoutes: Record<string, string> = {
        instructor: '/instructor',
        judge: '/judge',
        student: '/lms',
        school_admin: '/dashboard',
        sponsor: '/sponsors',
        super_admin: '/dashboard',
        content_manager: '/dashboard',
        reviewer: '/dashboard',
        competition_manager: '/dashboard'
      };
      this.router.navigate([roleRoutes[finalRole] || '/dashboard']);
    }, 800);
  }

  // ─── Championship Stories Animations ────────────────────────────────

  private setupSpotlightObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    this.spotlightObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          this.spotlightObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    const el = this.elementRef.nativeElement.querySelector('.spotlight-section');
    if (el) this.spotlightObserver.observe(el);
  }

  private setupTracksObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    this.tracksObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          this.tracksObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    const el = this.elementRef.nativeElement.querySelector('.departments-section');
    if (el) this.tracksObserver.observe(el);
  }

  private setupScoreboardObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    this.scoreboardObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          this.scoreboardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    const el = this.elementRef.nativeElement.querySelector('.live-scoreboard-section');
    if (el) this.scoreboardObserver.observe(el);
  }

  private setupStatsObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    this.statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          this.animateStatsCounters();
          this.statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    const el = this.elementRef.nativeElement.querySelector('.academic-stats-tree-section');
    if (el) this.statsObserver.observe(el);
  }

  private setupConceptObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    this.conceptObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          this.conceptObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    const el = this.elementRef.nativeElement.querySelector('.concept-section');
    if (el) this.conceptObserver.observe(el);
  }

  private setupSupportObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    this.supportObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          this.supportObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    const el = this.elementRef.nativeElement.querySelector('.support-section');
    if (el) this.supportObserver.observe(el);
  }

  openSupportModal(type: 'mail' | 'team' | 'competition' | 'suggestion'): void {
    this.activeSupportType = type;
    this.isSupportModalOpen = true;
    this.supportSubmitted = false;
    this.supportForm = {
      name: '',
      email: '',
      subject: '',
      message: '',
      amount: 100,
      schoolName: 'Presbyterian Boys\' Sec. School (PRESEC)',
      competitionTier: 'regional'
    };
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
  }

  closeSupportModal(): void {
    this.isSupportModalOpen = false;
    this.activeSupportType = null;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }

  submitSupportForm(): void {
    this.supportSubmitted = true;
  }

  animateStatsCounters(): void {
    if (this.statsAnimated) return;
    this.statsAnimated = true;

    const duration = 2000;
    const startTime = performance.now();

    this.ngZone.runOutsideAngular(() => {
      const regionsEl = this.elementRef.nativeElement.querySelector('.node-regions .node-number');
      const mentorsEl = this.elementRef.nativeElement.querySelector('.node-mentors .node-number');
      const schoolsEl = this.elementRef.nativeElement.querySelector('.node-schools .node-number');
      const studentsEl = this.elementRef.nativeElement.querySelector('.node-students .node-number');
      const projectsEl = this.elementRef.nativeElement.querySelector('.node-projects .node-number');
      const grantsEl = this.elementRef.nativeElement.querySelector('.node-grants .node-number');

      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = progress * (2 - progress);

        const stats = this.contentService.platformStats;
        const r = Math.floor(ease * stats.regions);
        const m = Math.floor(ease * stats.mentors);
        const s = Math.floor(ease * stats.schools);
        const st = Math.floor(ease * stats.students);
        const p = (ease * stats.projects).toFixed(1);
        const g = Math.floor(ease * stats.grants);

        if (regionsEl) regionsEl.textContent = `${r}`;
        if (mentorsEl) mentorsEl.textContent = `${m}+`;
        if (schoolsEl) schoolsEl.textContent = `${s}+`;
        if (studentsEl) studentsEl.textContent = `${st}K+`;
        if (projectsEl) projectsEl.textContent = `${p}K+`;
        if (grantsEl) grantsEl.textContent = `₵${g}M+`;

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          if (regionsEl) regionsEl.textContent = `${stats.regions}`;
          if (mentorsEl) mentorsEl.textContent = `${stats.mentors}+`;
          if (schoolsEl) schoolsEl.textContent = `${stats.schools}+`;
          if (studentsEl) studentsEl.textContent = `${stats.students}K+`;
          if (projectsEl) projectsEl.textContent = `${stats.projects}K+`;
          if (grantsEl) grantsEl.textContent = `₵${stats.grants}M+`;
          
          this.ngZone.run(() => {
            this.regionsCount = stats.regions;
            this.mentorsCount = stats.mentors;
            this.schoolsCount = stats.schools;
            this.studentsCount = stats.students;
            this.projectsCount = stats.projects;
            this.grantsCount = stats.grants;
          });
        }
      };

      requestAnimationFrame(step);
    });
  }

  private setupCardParallax(): void {
    if (typeof window === 'undefined') return;
    this.ngZone.runOutsideAngular(() => {
      // Only apply parallax to the most prominent cards to reduce DOM work
      const cards = this.elementRef.nativeElement.querySelectorAll(
        '.why-exist-card, .gateway-card-inner, .academic-login-card, .hero-text-card, .scoreboard-table-card'
      );
      cards.forEach((card: HTMLElement) => {
        const isLoginCard = card.classList.contains('academic-login-card') || card.classList.contains('gateway-card-inner');
        let rAFId: number | null = null;
        let lastX = 0, lastY = 0;

        const mouseMoveHandler = (event: MouseEvent) => {
          lastX = event.clientX;
          lastY = event.clientY;
          if (rAFId) return; // Already scheduled — skip

          rAFId = requestAnimationFrame(() => {
            rAFId = null;
            const rect = card.getBoundingClientRect();
            const x = lastX - rect.left;
            const y = lastY - rect.top;
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const multiplier = isLoginCard ? -2 : -4;
            const rx = ((y - cy) / cy) * multiplier;
            const ry = ((x - cx) / cx) * Math.abs(multiplier);

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);

            if (isLoginCard) {
              card.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(0, -4px, 10px)`;
            } else {
              card.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px) scale(1.01)`;
            }
            card.style.transition = 'transform 0.1s linear';
          });
        };

        const mouseLeaveHandler = () => {
          if (rAFId) { cancelAnimationFrame(rAFId); rAFId = null; }
          card.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.4, 0.64, 1)';
          card.style.transform = '';
        };

        card.addEventListener('mousemove', mouseMoveHandler, { passive: true });
        card.addEventListener('mouseleave', mouseLeaveHandler);

        this.cardListeners.push({
          card,
          mouseMove: mouseMoveHandler,
          mouseLeave: mouseLeaveHandler
        });
      });
    });
  }

  // ── COUNTDOWN CLOCK ─────────────────────────────────────────
  startCountdown(): void {
    const update = () => {
      const now = new Date().getTime();
      const dist = this.competitionDate.getTime() - now;
      if (dist <= 0) {
        this.countdownDays = this.countdownHours = this.countdownMins = this.countdownSecs = 0;
        return;
      }
      this.countdownDays  = Math.floor(dist / (1000 * 60 * 60 * 24));
      this.countdownHours = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      this.countdownMins  = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
      this.countdownSecs  = Math.floor((dist % (1000 * 60)) / 1000);
      this.countdownTick  = !this.countdownTick;
    };
    update();
    this.ngZone.runOutsideAngular(() => {
      this.countdownInterval = setInterval(() => {
        this.ngZone.run(() => update());
      }, 1000);
    });
  }

  // ── STRIPE DATA-VIZ CANVAS (Lightweight Underwater Sea Leaves & Fishes) ───
  startMatrixRain(): void {
    if (typeof window === 'undefined' || !this.matrixCanvasRef) return;
    const canvas = this.matrixCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.matrixAnimFrame) { cancelAnimationFrame(this.matrixAnimFrame); this.matrixAnimFrame = null; }
    if (this.matrixResizeListener) window.removeEventListener('resize', this.matrixResizeListener);
    if (this.matrixMouseListener) window.removeEventListener('mousemove', this.matrixMouseListener);
    if (this.matrixTouchListener) window.removeEventListener('touchmove', this.matrixTouchListener);

    this.ngZone.runOutsideAngular(() => {
      const getDimensions = () => {
        const w = canvas.parentElement?.clientWidth || window.innerWidth || canvas.offsetWidth || 1240;
        const h = canvas.parentElement?.clientHeight || 440;
        return { w, h };
      };
      let { w: width, h: height } = getDimensions();
      canvas.width = width; canvas.height = height;
      const getScale = () => Math.min(width / 1240, height / 680, 1);
      let sc = getScale();

      this.matrixResizeListener = () => {
        const dims = getDimensions();
        width = dims.w; height = dims.h;
        canvas.width = width; canvas.height = height;
        sc = getScale();
      };
      window.addEventListener('resize', this.matrixResizeListener);

      this.matrixMouseListener = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (mx >= -80 && mx <= rect.width + 80 && my >= -80 && my <= rect.height + 80) {
          this.stripeTargetMouseX = mx; this.stripeTargetMouseY = my;
        } else { this.stripeTargetMouseX = -9999; this.stripeTargetMouseY = -9999; }
      };
      window.addEventListener('mousemove', this.matrixMouseListener);
      this.matrixTouchListener = (e: TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        if (!touch) return;
        const tx = touch.clientX - rect.left;
        const ty = touch.clientY - rect.top;
        if (tx >= -80 && tx <= rect.width + 80 && ty >= -80 && ty <= rect.height + 80) {
          this.stripeTargetMouseX = tx; this.stripeTargetMouseY = ty;
        } else { this.stripeTargetMouseX = -9999; this.stripeTargetMouseY = -9999; }
      };
      window.addEventListener('touchmove', this.matrixTouchListener, { passive: true });
      this.stripeTargetMouseX = -9999; this.stripeTargetMouseY = -9999;
      this.stripeMouseX = -9999; this.stripeMouseY = -9999;

      // ── STALKS (80 — down from 160) ────────────────────────
      interface Stalk {
        bx: number; by: number; ba: number; ca: number;
        len: number; ml: number; spd: number; lw: number; dr: number;
        a: number; ss: number; sp: number; sa: number; ci: number; cv: number;
      }
      const stalks: Stalk[] = [];
      const initStalks = () => {
        stalks.length = 0;
        const stalkCount = Math.round(65 * Math.max(sc, 0.4));
        for (let i = 0; i < stalkCount; i++) {
          const t = i / 64;
          const bx = -20 + t * (width + 40) + (Math.random() - 0.5) * 30;
          const ba = -Math.PI / 2 + (t - 0.5) * 0.55 + (Math.random() - 0.5) * 0.15;
          const ml = Math.min(height - 90, height * (0.25 + Math.random() * 0.4));
          stalks.push({ bx, by: height + 10, ba, ca: ba, len: Math.random() * ml, ml,
            spd: 0.4 + Math.random() * 0.6, lw: 0.5 + Math.random() * 0.9,
            dr: 1.5 + Math.random() * 3, a: 0.3 + Math.random() * 0.6,
            ss: 0.012 + Math.random() * 0.02, sp: Math.random() * Math.PI * 2,
            sa: 0.03 + Math.random() * 0.05, ci: i % 5,
            cv: (Math.random() - 0.5) * 35 });
        }
      };
      initStalks();

      // ── REALISTIC COMPACT SEAWEEDS ALONG SEAFLOOR ────────────────
      interface Seaweed {
        x: number; h: number; p: number; blades: number; color: string; color2: string;
      }
      const seaweeds: Seaweed[] = [];
      const seaweedColors = [
        { c1: '#0d9488', c2: 'rgba(94, 234, 212, 0.65)' }, // Rich marine teal
        { c1: '#059669', c2: 'rgba(110, 231, 183, 0.65)' }, // Natural ocean emerald
        { c1: '#15803d', c2: 'rgba(134, 239, 172, 0.65)' }, // Deep kelp green
        { c1: '#0f766e', c2: 'rgba(45, 212, 191, 0.65)' }  // Aquatic sea fern
      ];
      const initSeaweeds = () => {
        seaweeds.length = 0;
        const seaweedCount = Math.round(24 * Math.max(sc, 0.5));
        for (let i = 0; i < seaweedCount; i++) {
          const pal = seaweedColors[i % seaweedColors.length];
          seaweeds.push({
            x: -10 + (i / 23) * (width + 20) + (Math.random() - 0.5) * 18,
            h: 22 + Math.random() * 26,
            p: Math.random() * Math.PI * 2,
            blades: 3 + Math.floor(Math.random() * 3),
            color: pal.c1,
            color2: pal.c2
          });
        }
      };
      initSeaweeds();

      // ── GAME STATE & FLOATING BASKET (SEA CATCH CHALLENGE - 20 FISHES) ──
      let gameScore = 0;
      let isCelebrating = false;
      let celebrationTimer = 0;

      interface FloatingText {
        x: number; y: number; text: string; color: string; alpha: number; vy: number;
      }
      const floatingTexts: FloatingText[] = [];

      interface Confetti {
        x: number; y: number; vx: number; vy: number; color: string; size: number; alpha: number;
      }
      const confettis: Confetti[] = [];

      const basket = {
        x: width * 0.65,
        y: height * 0.42,
        vx: -0.6,
        vy: 0.45,
        radius: Math.max(14, 28 * sc),
        pulse: 0
      };

      // ── FISHES (20 with Species & Basket Deposit / Celebration) ────────────────
      interface Fish {
        id: number; name: string; x: number; y: number; vx: number; vy: number;
        s: number; c: string; g: string; tp: number; sp: number; caught: boolean;
        inBasket: boolean;
        burstTimer?: number; burstMult?: number;
      }
      const speciesList = [
        'Cyber Koi', 'Neon Tetra', 'Volt Guppy', 'Plasma Betta',
        'Quantum Danio', 'Gold Arowana', 'Luminous Angelfish', 'Photon Cichlid',
        'Crimson Tilapia', 'Starlight Barb', 'Emerald Snapper', 'Spectrum Perch'
      ];
      const fishes: Fish[] = [];
      const fp = [
        { b: '#00f2fe', g: 'rgba(0,242,254,0.6)' }, { b: '#ff007f', g: 'rgba(255,0,127,0.6)' },
        { b: '#ffd700', g: 'rgba(255,215,0,0.5)' }, { b: '#c084fc', g: 'rgba(192,132,252,0.5)' },
        { b: '#34d399', g: 'rgba(52,211,153,0.5)' }, { b: '#ff7b00', g: 'rgba(255,123,0,0.5)' }
      ];
      const initFishes = () => {
        fishes.length = 0;
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = Math.max(0.6, (1.1 + Math.random() * 1.1) * Math.max(sc, 0.5));
          const p = fp[i % fp.length];
          fishes.push({
            id: i + 1,
            name: speciesList[i % speciesList.length],
            x: Math.random() * width,
            y: height * 0.15 + Math.random() * height * 0.65,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.35,
            s: Math.max(2.5, (4.5 + Math.random() * 3.5) * sc), c: p.b, g: p.g,
            tp: Math.random() * Math.PI * 2, sp, caught: false,
            inBasket: false,
            burstTimer: 60 + Math.random() * 180, burstMult: 1
          });
        }
      };
      initFishes();

      // ── BUBBLES (Reduced & softer per request) ───────────────
      interface Bub { x: number; y: number; r: number; vy: number; a: number; p: number; }
      const bubs: Bub[] = [];
      const initBubs = () => {
        bubs.length = 0;
        for (let i = 0; i < 5; i++) {
          bubs.push({ x: Math.random() * width, y: Math.random() * height,
            r: 0.7 + Math.random() * 1.1, vy: -(0.12 + Math.random() * 0.2),
            a: 0.06 + Math.random() * 0.1, p: Math.random() * Math.PI * 2 });
        }
      };
      initBubs();

      // ── GRACEFUL PASSING JELLYFISHES ─────────────────────────
      interface Jellyfish {
        x: number; y: number; vx: number; vy: number;
        size: number; color: string; p: number;
      }
      const jellies: Jellyfish[] = [];
      const jellyColors = [
        'rgba(192, 132, 252, 0.75)',
        'rgba(0, 242, 254, 0.75)',
        'rgba(255, 0, 127, 0.75)'
      ];
      const initJellies = () => {
        jellies.length = 0;
        for (let i = 0; i < 3; i++) {
          jellies.push({
            x: (i * (width / 3)) + 80,
            y: height * (0.4 + i * 0.2),
            vx: 0.35 + i * 0.1,
            vy: -0.25 - i * 0.08,
            size: 14 + Math.random() * 6,
            color: jellyColors[i % jellyColors.length],
            p: Math.random() * Math.PI * 2
          });
        }
      };
      initJellies();

      interface Ripple { x: number; y: number; r: number; alpha: number; }
      const ripples: Ripple[] = [];

      let caughtFish: Fish | null = null;

      // Click listener for Catch & Release & Basket Deposit
      if (this.matrixClickListener) canvas.removeEventListener('click', this.matrixClickListener);
      this.matrixClickListener = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Spawn ripple on every click
        ripples.push({ x: clickX, y: clickY, r: 4, alpha: 0.9 });

        // If currently celebrating, click anywhere resets for a new game!
        if (isCelebrating) {
          isCelebrating = false;
          gameScore = 0;
          fishes.forEach(f => {
            f.inBasket = false;
            f.caught = false;
            f.x = Math.random() * width;
            f.y = height * 0.15 + Math.random() * height * 0.65;
            f.vx = (Math.random() - 0.5) * 3;
            f.vy = (Math.random() - 0.5) * 2;
          });
          floatingTexts.push({ x: width / 2, y: height / 2, text: '🌊 NEW ROUND STARTED! CATCH ALL 20 FISHES!', color: '#00f2fe', alpha: 1, vy: -1.2 });
          return;
        }

        if (caughtFish) {
          const distToBasket = Math.hypot(clickX - basket.x, clickY - basket.y);
          if (distToBasket < basket.radius + 50 * sc) {
            // SUCCESS DEPOSIT INTO BASKET!
            caughtFish.caught = false;
            caughtFish.inBasket = true;
            basket.pulse = 1;
            gameScore += 100;

            const basketCount = fishes.filter(f => f.inBasket).length;
            floatingTexts.push({
              x: basket.x,
              y: basket.y - 65,
              text: `+100 PTS! (${basketCount}/20 FISH)`,
              color: '#00f2fe',
              alpha: 1,
              vy: -1.5
            });

            // Celebratory bubbles around basket
            for (let b = 0; b < 12; b++) {
              bubs.push({
                x: basket.x + (Math.random() - 0.5) * 40,
                y: basket.y + (Math.random() - 0.5) * 40,
                r: 1.5 + Math.random() * 3, vy: -(0.6 + Math.random() * 1.3),
                a: 0.85, p: Math.random() * Math.PI * 2
              });
            }

            // CHECK IF ALL 20 FISH CAUGHT
            if (basketCount >= 20) {
              isCelebrating = true;
              celebrationTimer = 480;
              gameScore += 2000; // Bonus for catching all 20

              floatingTexts.push({
                x: basket.x,
                y: basket.y - 110,
                text: '🎉 EXPLOSION! ALL 20 FISHES ESCAPING!',
                color: '#ffd700',
                alpha: 1,
                vy: -2.0
              });

              // Fireworks confetti burst
              const confettiColors = ['#ffd700', '#00f2fe', '#ff007f', '#34d399', '#c084fc', '#ff7b00'];
              for (let c = 0; c < 120; c++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 2 + Math.random() * 9;
                confettis.push({
                  x: basket.x,
                  y: basket.y,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd - 2.5,
                  color: confettiColors[c % confettiColors.length],
                  size: 4 + Math.random() * 5,
                  alpha: 1
                });
              }

              // All 20 fishes escape out of the basket in an explosive outward burst!
              fishes.forEach((f, idx) => {
                f.inBasket = false;
                f.caught = false;
                f.x = basket.x;
                f.y = basket.y;
                const escapeAng = (idx / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                f.vx = Math.cos(escapeAng) * (6 + Math.random() * 5);
                f.vy = Math.sin(escapeAng) * (4 + Math.random() * 4);
              });
            }
          } else {
            // RELEASED OUTSIDE BASKET - MISS SCORE
            caughtFish.caught = false;
            gameScore = Math.max(0, gameScore - 20);
            floatingTexts.push({
              x: clickX,
              y: clickY - 30,
              text: '-20 PTS (Released outside basket)',
              color: '#ff4b4b',
              alpha: 1,
              vy: -1.2
            });

            // Give fish playful escape burst
            const escapeAngle = Math.random() * Math.PI * 2;
            caughtFish.vx = Math.cos(escapeAngle) * (3.5 + Math.random() * 2);
            caughtFish.vy = Math.sin(escapeAngle) * (2.5 + Math.random() * 1.5);
          }
          caughtFish = null;
        } else {
          // Try to catch closest free fish within 48px
          let closest: Fish | null = null;
          let minDist = Math.max(28, 48 * sc);
          for (const f of fishes) {
            if (f.inBasket) continue;
            const dist = Math.hypot(f.x - clickX, f.y - clickY);
            if (dist < minDist) {
              minDist = dist;
              closest = f;
            }
          }
          if (closest) {
            closest.caught = true;
            caughtFish = closest;
            // Spawn splash bubbles
            for (let b = 0; b < 8; b++) {
              bubs.push({
                x: clickX + (Math.random() - 0.5) * 20,
                y: clickY + (Math.random() - 0.5) * 20,
                r: 1.5 + Math.random() * 2.5, vy: -(0.4 + Math.random() * 0.8),
                a: 0.75, p: Math.random() * Math.PI * 2
              });
            }
          } else {
            // MISSED CATCH (clicked empty sea)
            gameScore = Math.max(0, gameScore - 10);
            floatingTexts.push({
              x: clickX,
              y: clickY - 20,
              text: '-10 PTS (Miss)',
              color: '#ffb703',
              alpha: 1,
              vy: -1.0
            });
          }
        }
      };
      canvas.addEventListener('click', this.matrixClickListener);

      this.matrixResizeListener = () => {
        const { w, h } = getDimensions();
        width = canvas.width = w; height = canvas.height = h;
        sc = getScale();
        initStalks(); initSeaweeds(); initFishes(); initBubs(); initJellies();
      };
      window.addEventListener('resize', this.matrixResizeListener);

      let frame = 0;
      const nc = ['255, 0, 150', '0, 242, 254', '255, 123, 0', '52, 211, 153', '192, 132, 252'];

      let lastFrameTime = 0;

      const draw = (timestamp: number) => {
        // dt: time-scale normalised to 60fps so physics run at identical speed at any FPS.
        const rawDelta = lastFrameTime === 0 ? 16.667 : timestamp - lastFrameTime;
        lastFrameTime = timestamp;
        const dt = Math.min(Math.max(rawDelta, 4) / 16.667, 3);
        frame += dt;

        const currW = Math.max(canvas.parentElement?.clientWidth || 0, window.innerWidth || 0, document.documentElement.clientWidth || 0, 1240);
        const currH = canvas.parentElement?.clientHeight || 440;
        if (canvas.width !== currW || canvas.height !== currH) {
          width = canvas.width = currW;
          height = canvas.height = currH;
          sc = getScale();
        }
        if (!width || !height) { this.matrixAnimFrame = requestAnimationFrame(draw); return; }

        // Fast & fluid mouse lerp (0.38 instead of 0.1 for instant responsiveness)
        if (this.stripeTargetMouseX !== -9999) {
          if (this.stripeMouseX === -9999) {
            this.stripeMouseX = this.stripeTargetMouseX;
            this.stripeMouseY = this.stripeTargetMouseY;
          } else {
            this.stripeMouseX += (this.stripeTargetMouseX - this.stripeMouseX) * 0.38;
            this.stripeMouseY += (this.stripeTargetMouseY - this.stripeMouseY) * 0.38;
          }
        } else {
          this.stripeMouseX = -9999;
          this.stripeMouseY = -9999;
        }

        ctx.clearRect(0, 0, width, height);

        // Check if cursor hovering near any fish to change cursor
        let hoveredFish: Fish | null = null;
        if (this.stripeTargetMouseX !== -9999 && !caughtFish) {
          for (const f of fishes) {
            if (Math.hypot(f.x - this.stripeTargetMouseX, f.y - this.stripeTargetMouseY) < 45) {
              hoveredFish = f;
              break;
            }
          }
        }
        canvas.style.cursor = (hoveredFish || caughtFish) ? 'pointer' : 'default';

        // ── SUNRISE OVER REALISTIC DEEP OCEAN ───────────────────
        ctx.save();
        const horizonY = 80;

        // 1. WARM SUNRISE SKY (ABOVE THE WAVES: 0 to horizonY) — White fading into sunlight!
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, '#ffffff');    // Seamless fade from white background above
        skyGrad.addColorStop(0.22, '#fff4e6'); // Soft morning cream light
        skyGrad.addColorStop(0.5, '#ffd29d');  // Warm sunlight glow
        skyGrad.addColorStop(0.8, '#ff9e5e');  // Vibrant morning apricot
        skyGrad.addColorStop(1, '#ff8040');    // Rich sunrise horizon glow
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-20, 0, width + 100, horizonY + 10);

        // Rising Morning Sun orb positioned higher up in the morning sky
        const sunX = width * 0.28;
        const sunY = horizonY - 36;
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 130);
        sunGlow.addColorStop(0, 'rgba(255, 255, 230, 0.98)');
        sunGlow.addColorStop(0.28, 'rgba(255, 230, 130, 0.82)');
        sunGlow.addColorStop(0.65, 'rgba(255, 150, 75, 0.3)');
        sunGlow.addColorStop(1, 'rgba(255, 150, 75, 0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 130, 0, Math.PI * 2);
        ctx.fill();

        // Solid Sun Disc
        ctx.fillStyle = '#fffef4';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 24, 0, Math.PI * 2);
        ctx.fill();

        // 2. OCEAN WATER COLUMN (BELOW THE WAVES: horizonY to height)
        // Clip or fill ocean region precisely from the wavy surface down across entire screen
        ctx.beginPath();
        ctx.moveTo(-20, height + 10);
        ctx.lineTo(-20, horizonY);
        for (let x = -20; x <= width + 80; x += 15) {
          const wY = horizonY + Math.sin(x * 0.025 + frame * 0.05) * 5 + Math.cos(x * 0.06 - frame * 0.03) * 2;
          ctx.lineTo(x, wY);
        }
        ctx.lineTo(width + 80, height + 10);
        ctx.closePath();

        const oceanGrad = ctx.createLinearGradient(0, horizonY, 0, height);
        oceanGrad.addColorStop(0, '#005480');    // Sunlit morning ocean surface
        oceanGrad.addColorStop(0.25, '#013259'); // Tropical ocean blue
        oceanGrad.addColorStop(0.7, '#011933');  // Deep water column
        oceanGrad.addColorStop(1, '#010c1c');    // Seafloor abyss
        ctx.fillStyle = oceanGrad;
        ctx.fill();

        // 3. DYNAMIC SUNRISE GOD RAYS ENTERING THE OCEAN FROM THE SUN
        ctx.save();
        // Clip god rays so they only appear inside the ocean water below horizon
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, horizonY);
        for (let x = 0; x <= width; x += 20) {
          const wY = horizonY + Math.sin(x * 0.025 + frame * 0.05) * 5 + Math.cos(x * 0.06 - frame * 0.03) * 2;
          ctx.lineTo(x, wY);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.clip();

        const angles = [-0.45, -0.25, -0.05, 0.15, 0.35, 0.55];
        for (let r = 0; r < angles.length; r++) {
          const ang = angles[r] + Math.sin(frame * 0.012 + r) * 0.04;
          const spread = 0.1 + Math.sin(frame * 0.02 + r * 1.5) * 0.03;
          const rayLen = height * 1.25;
          const rayAlpha = 0.08 + 0.05 * Math.sin(frame * 0.03 + r);

          ctx.beginPath();
          ctx.moveTo(sunX, sunY);
          ctx.lineTo(sunX + Math.cos(ang - spread) * rayLen, sunY + Math.sin(ang - spread) * rayLen);
          ctx.lineTo(sunX + Math.cos(ang + spread) * rayLen, sunY + Math.sin(ang + spread) * rayLen);
          ctx.closePath();

          const rayGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, rayLen * 0.85);
          rayGrad.addColorStop(0, `rgba(255, 235, 160, ${rayAlpha * 2.2})`);
          rayGrad.addColorStop(0.35, `rgba(120, 235, 255, ${rayAlpha * 1.3})`);
          rayGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');
          ctx.fillStyle = rayGrad;
          ctx.fill();
        }
        ctx.restore();

        // Crisp White/Gold Wave Crest Shimmer Line separating sky and ocean
        ctx.strokeStyle = 'rgba(255, 240, 190, 0.75)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let x = -20; x <= width + 80; x += 15) {
          const wY = horizonY + Math.sin(x * 0.025 + frame * 0.05) * 5 + Math.cos(x * 0.06 - frame * 0.03) * 2;
          if (x === -20) ctx.moveTo(x, wY); else ctx.lineTo(x, wY);
        }
        ctx.stroke();

        // 4. Rolling Sandy Coral Seafloor along Bottom
        ctx.beginPath();
        ctx.moveTo(-20, height + 10);
        for (let x = -20; x <= width + 80; x += 20) {
          const floorY = height - 22 - Math.sin(x * 0.008) * 14 - Math.cos(x * 0.02 + 1) * 8;
          ctx.lineTo(x, floorY);
        }
        ctx.lineTo(width + 80, height + 10);
        ctx.closePath();
        const floorGrad = ctx.createLinearGradient(0, height - 45, 0, height);
        floorGrad.addColorStop(0, '#0a2342');
        floorGrad.addColorStop(1, '#051124');
        ctx.fillStyle = floorGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.22)';
        ctx.lineWidth = 1.5;
        ctx.restore();

        // 4b. Realistic Compact Marine Seaweeds Along Seafloor
        seaweeds.forEach(sw => {
          const baseFloorY = height - 10;
          for (let b = 0; b < sw.blades; b++) {
            const bx = sw.x + (b - (sw.blades - 1) / 2) * 5;
            const bh = sw.h * (0.75 + (b % 2) * 0.25);
            const sway1 = Math.sin(frame * 0.035 + sw.p + b * 0.7) * 6;
            const sway2 = Math.cos(frame * 0.04 + sw.p - b * 0.5) * 10;
            const tipX = bx + sway2;
            const tipY = baseFloorY - bh;
            const midX = bx + sway1;
            const midY = baseFloorY - bh * 0.52;

            // Realistic tapering marine kelp blade
            ctx.beginPath();
            ctx.moveTo(bx - 2.4, baseFloorY);
            ctx.quadraticCurveTo(midX - 1.2, midY, tipX, tipY);
            ctx.quadraticCurveTo(midX + 1.2, midY, bx + 2.4, baseFloorY);
            ctx.closePath();
            ctx.fillStyle = sw.color;
            ctx.fill();

            // Central sunlit vein
            ctx.beginPath();
            ctx.moveTo(bx, baseFloorY);
            ctx.quadraticCurveTo(midX, midY, tipX, tipY);
            ctx.strokeStyle = sw.color2;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        });

        // Mouse aurora
        if (this.stripeMouseX !== -9999) {
          const mg = ctx.createRadialGradient(this.stripeMouseX, this.stripeMouseY, 0, this.stripeMouseX, this.stripeMouseY, 220);
          mg.addColorStop(0, 'rgba(0,242,254,0.22)'); mg.addColorStop(0.4, 'rgba(192,132,252,0.12)');
          mg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = mg; ctx.beginPath();
          ctx.arc(this.stripeMouseX, this.stripeMouseY, 220, 0, Math.PI * 2); ctx.fill();
        }

        // Ripples
        for (let r = ripples.length - 1; r >= 0; r--) {
          const rp = ripples[r];
          rp.r += 2.2;
          rp.alpha -= 0.025;
          if (rp.alpha <= 0) {
            ripples.splice(r, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(0, 242, 254, ${rp.alpha})`;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Bubbles / Jellyfishes bounce at sea level and continue
        for (let i = bubs.length - 1; i >= 0; i--) {
          const b = bubs[i];
          b.y += b.vy * dt; b.x += Math.sin(frame * 0.025 + b.p) * 0.3 * dt;
          if (b.y < 88) { b.y = 88; b.vy = Math.abs(b.vy); }
          else if (b.y > height - 15) { b.y = height - 15; b.vy = -Math.abs(b.vy); }
          ctx.fillStyle = `rgba(180,200,255,${b.a * (0.6 + 0.4 * Math.sin(frame * 0.04 + b.p))})`;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        }

        // Stalks
        stalks.forEach(st => {
          st.len += st.spd * dt;
          if (st.len > st.ml) st.len = 0;
          const sway = Math.sin(frame * st.ss + st.sp) * st.sa;
          let ms = 0, mp = 0;
          if (this.stripeMouseX !== -9999) {
            const tx = st.bx + Math.cos(st.ba + sway) * st.len;
            const ty = st.by + Math.sin(st.ba + sway) * st.len;
            const dx = tx - this.stripeMouseX, dy = ty - this.stripeMouseY;
            const d = Math.hypot(dx, dy);
            if (d < 280) { mp = 1 - d / 280; ms = (dx >= 0 ? 1 : -1) * mp * mp * 0.5; }
          }
          st.ca += (st.ba + sway + ms - st.ca) * 0.08 * dt;
          const tipX = st.bx + Math.cos(st.ca) * st.len;
          const tipY = st.by + Math.sin(st.ca) * st.len;
          const midX = (st.bx + tipX) / 2 + st.cv * Math.sin(frame * st.ss * 0.5 + st.sp);
          const midY = (st.by + tipY) / 2 + st.cv * 0.5;
          const p = 0.7 + 0.3 * Math.sin(frame * 0.03 + st.sp);
          const al = st.a * p * Math.min(1, st.len / 80);
          if (al <= 0.01) return;
          const near = mp > 0.05;
          const col = near ? nc[st.ci] : '200,200,255';
          ctx.beginPath(); ctx.moveTo(st.bx, st.by);
          ctx.quadraticCurveTo(midX, midY, tipX, tipY);
          if (near) {
            const lg = ctx.createLinearGradient(st.bx, st.by, tipX, tipY);
            lg.addColorStop(0, 'rgba(80,60,180,0)');
            lg.addColorStop(0.3, `rgba(140,120,220,${al * 0.3})`);
            lg.addColorStop(1, `rgba(${col},${al})`);
            ctx.strokeStyle = lg;
          } else {
            ctx.strokeStyle = `rgba(160,155,230,${al * 0.7})`;
          }
          ctx.lineWidth = st.lw * (near ? 1.4 : 1); ctx.stroke();
          ctx.fillStyle = `rgba(${col},${al})`;
          ctx.beginPath(); ctx.arc(tipX, tipY, st.dr * (near ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
        });

        // Fishes
        fishes.forEach(f => {
          if (f.inBasket) {
            // School gracefully inside the woven net bag pocket below open rim
            const orbitAng = frame * 0.035 + f.tp;
            const orbitR = (f.id % 4) * (basket.radius * 0.38);
            const targetX = basket.x + Math.cos(orbitAng) * orbitR;
            const targetY = basket.y + 28 + Math.sin(orbitAng * 0.8) * (basket.radius * 0.38);
            f.x += (targetX - f.x) * 0.15 * dt;
            f.y += (targetY - f.y) * 0.15 * dt;
            f.vx = Math.sin(frame * 0.08 + f.tp) * 0.4;
            f.vy = Math.cos(frame * 0.08 + f.tp) * 0.25;
          } else if (f.caught && this.stripeMouseX !== -9999) {
            // Smoothly hold caught fish inside protective bubble at cursor
            f.x += (this.stripeMouseX - f.x) * 0.35 * dt;
            f.y += (this.stripeMouseY - f.y) * 0.35 * dt;
            f.vx = Math.sin(frame * 0.08) * 0.5;
            f.vy = Math.cos(frame * 0.08) * 0.3;
          } else {
            f.burstTimer = (f.burstTimer || 100) - dt;
            if (f.burstTimer <= 0) {
              // Trigger a swift darting speed burst
              f.burstMult = 2.4 + Math.random() * 1.4;
              f.burstTimer = 80 + Math.random() * 180;
              const angle = Math.atan2(f.vy, f.vx) + (Math.random() - 0.5) * 0.5;
              f.vx = Math.cos(angle) * f.sp * f.burstMult;
              f.vy = Math.sin(angle) * f.sp * f.burstMult * 0.55;
            } else {
              f.burstMult = (f.burstMult || 1) + (1 - (f.burstMult || 1)) * 0.025 * dt;
            }

            f.x += f.vx * dt;
            f.y += (f.vy + Math.sin(frame * 0.05 + f.tp) * 0.25) * dt;
            if (f.x < -45) f.x = width + 45; if (f.x > width + 45) f.x = -45;
            if (f.y < 95) f.vy = Math.abs(f.vy); if (f.y > height - 55) f.vy = -Math.abs(f.vy);
            if (this.stripeMouseX !== -9999) {
              const dx = f.x - this.stripeMouseX, dy = f.y - this.stripeMouseY;
              const d = Math.hypot(dx, dy);
              if (d < 160 && d > 20) { f.vx += (dx / d) * 0.12 * dt; f.vy += (dy / d) * 0.08 * dt; }
            }
            const maxSpd = f.sp * (f.burstMult || 1) * 1.8;
            const spd = Math.hypot(f.vx, f.vy);
            if (spd > maxSpd) { f.vx = (f.vx / spd) * maxSpd; f.vy = (f.vy / spd) * maxSpd; }
            f.vx *= Math.pow(0.998, dt); f.vy *= Math.pow(0.998, dt);
          }

          const s = f.s;

          // Target crosshair if hovered
          if (hoveredFish === f && !f.caught) {
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(f.x, f.y, s * 3 + Math.sin(frame * 0.15) * 3, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Protective water bubble + species banner if caught
          if (f.caught) {
            const bubbleR = s * 3.2 + 10;
            const bgra = ctx.createRadialGradient(f.x - 4, f.y - 4, 2, f.x, f.y, bubbleR);
            bgra.addColorStop(0, 'rgba(0, 242, 254, 0.35)');
            bgra.addColorStop(0.7, 'rgba(0, 242, 254, 0.12)');
            bgra.addColorStop(1, 'rgba(0, 242, 254, 0.55)');
            ctx.fillStyle = bgra;
            ctx.beginPath();
            ctx.arc(f.x, f.y, bubbleR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#00f2fe';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // HUD species label pill above bubble
            const label = `🎣 Caught: ${f.name} — Click to release`;
            ctx.font = `bold ${Math.round(12 * Math.max(sc, 0.7))}px Inter, sans-serif`;
            const tm = ctx.measureText(label);
            const pillW = tm.width + Math.round(24 * sc);
            const pillH = Math.round(26 * Math.max(sc, 0.7));
            const pillX = f.x - pillW / 2;
            const pillY = f.y - bubbleR - Math.round(36 * sc);

            ctx.fillStyle = 'rgba(10, 15, 35, 0.9)';
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, 13);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#00f2fe';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, f.x, pillY + pillH / 2);
          }

          // Draw fish body
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.vy, f.vx));
          ctx.fillStyle = f.c;
          ctx.beginPath(); ctx.ellipse(0, 0, s * 1.8, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
          const tw = Math.sin(frame * 0.25 + f.tp) * (s * 0.7);
          ctx.beginPath(); ctx.moveTo(-s * 1.2, 0);
          ctx.lineTo(-s * 2.6, -s + tw); ctx.lineTo(-s * 2.6, s + tw); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.arc(s, -s * 0.15, s * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(s * 1.06, -s * 0.15, s * 0.1, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });

        // Graceful Passing Jellyfishes — bounce off sea level & stay strictly underwater
        jellies.forEach(j => {
          const pulse = Math.sin(frame * 0.045 + j.p);
          j.x += (j.vx + Math.cos(frame * 0.02 + j.p) * 0.15) * dt;
          j.y += (j.vy + pulse * 0.2) * dt;

          const jBnd = Math.max(40, 105 * sc);
          // Bounce vertically off sea level and ocean floor
          if (j.y < jBnd) {
            j.y = jBnd;
            j.vy = Math.abs(j.vy);
          } else if (j.y > height - 35) {
            j.y = height - 35;
            j.vy = -Math.abs(j.vy);
          }

          if (j.x > width + 60) {
            j.x = -60;
          } else if (j.x < -60) {
            j.x = width + 60;
          }

          ctx.save();
          ctx.translate(j.x, j.y);
          ctx.rotate(0.12 * Math.sin(frame * 0.03 + j.p));

          const r = j.size * (1 + pulse * 0.08);

          // Flowing tentacles
          ctx.strokeStyle = j.color;
          ctx.lineWidth = 1.3;
          for (let t = -2; t <= 2; t++) {
            ctx.beginPath();
            const tx = t * (r * 0.32);
            ctx.moveTo(tx, 0);
            const wave1 = Math.sin(frame * 0.06 + j.p + t) * 6;
            const wave2 = Math.cos(frame * 0.05 + j.p - t) * 8;
            ctx.quadraticCurveTo(tx + wave1, r * 1.2, tx + wave2, r * 2.3);
            ctx.stroke();
          }

          // Glowing dome / bell
          const domeGrad = ctx.createRadialGradient(0, -r * 0.4, 2, 0, 0, r);
          domeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
          domeGrad.addColorStop(0.3, j.color);
          domeGrad.addColorStop(1, 'rgba(10, 15, 35, 0.2)');

          ctx.fillStyle = domeGrad;
          ctx.beginPath();
          ctx.arc(0, 0, r, Math.PI, 0);
          ctx.closePath();
          ctx.fill();

          // Delicate dome rim
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.restore();
        });

        // ── 1. FLOATING COLLECTION BASKET ──────────────────────
        basket.x += basket.vx * dt;
        basket.y += basket.vy * dt;
        const bnd = Math.max(50, 110 * sc);
        if (basket.x < bnd) { basket.x = bnd; basket.vx = Math.abs(basket.vx); }
        if (basket.x > width - bnd) { basket.x = width - bnd; basket.vx = -Math.abs(basket.vx); }
        if (basket.y < bnd) { basket.y = bnd; basket.vy = Math.abs(basket.vy); }
        if (basket.y > height - bnd + 15) { basket.y = height - bnd + 15; basket.vy = -Math.abs(basket.vy); }
        if (basket.pulse > 0) basket.pulse = Math.max(0, basket.pulse - 0.04 * dt);

        const fishesInBasket = fishes.filter(f => f.inBasket).length;
        const pulseExtra = basket.pulse * 18;
        const basketR = basket.radius + pulseExtra;

        ctx.save();
        // ── OPEN-MOUTH FISHING NET WITH DRAPING WOVEN POCKET ──
        const netTopY = basket.y - 12;
        const rx = basketR * 1.35; // Horizontal width of open mouth
        const ry = basketR * 0.52; // Vertical height of open mouth
        const bagBottomY = basket.y + basketR * 1.5;
        const bagSway = Math.sin(frame * 0.04) * 8;

        // 1. Net Bag Pocket Background Fill
        ctx.beginPath();
        ctx.moveTo(basket.x - rx, netTopY);
        ctx.bezierCurveTo(
          basket.x - rx * 0.82 + bagSway * 0.3, netTopY + basketR * 0.8,
          basket.x - rx * 0.48 + bagSway, bagBottomY,
          basket.x + bagSway, bagBottomY
        );
        ctx.bezierCurveTo(
          basket.x + rx * 0.48 + bagSway, bagBottomY,
          basket.x + rx * 0.82 + bagSway * 0.3, netTopY + basketR * 0.8,
          basket.x + rx, netTopY
        );
        ctx.closePath();
        const bagGrad = ctx.createLinearGradient(basket.x, netTopY, basket.x, bagBottomY);
        bagGrad.addColorStop(0, 'rgba(0, 242, 254, 0.16)');
        bagGrad.addColorStop(1, 'rgba(10, 28, 68, 0.55)');
        ctx.fillStyle = bagGrad;
        ctx.fill();

        // 2. Woven Net Mesh Threads Inside Pocket
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.38)';
        ctx.lineWidth = 1;
        // Horizontal net mesh loops
        for (let h = 1; h <= 5; h++) {
          const ratio = h / 6;
          const hy = netTopY + (bagBottomY - netTopY) * ratio;
          const hrx = rx * (1 - ratio * 0.58);
          const hSway = bagSway * ratio;
          ctx.beginPath();
          ctx.ellipse(basket.x + hSway, hy, Math.max(2, hrx), ry * (1 - ratio * 0.35), 0, 0, Math.PI);
          ctx.stroke();
        }
        // Vertical net mesh cords
        for (let v = -3; v <= 3; v++) {
          const vxTop = basket.x + v * (rx * 0.28);
          const vxBot = basket.x + bagSway + v * (rx * 0.12);
          ctx.beginPath();
          ctx.moveTo(vxTop, netTopY);
          ctx.quadraticCurveTo((vxTop + vxBot) / 2 + bagSway * 0.5, (netTopY + bagBottomY) / 2, vxBot, bagBottomY);
          ctx.stroke();
        }

        // 3. Wide-Open Mouth Rim Ring (Top Landing Entrance)
        const mouthGrad = ctx.createRadialGradient(basket.x, netTopY, rx * 0.15, basket.x, netTopY, rx);
        mouthGrad.addColorStop(0, 'rgba(0, 242, 254, 0.38)');
        mouthGrad.addColorStop(0.7, 'rgba(0, 242, 254, 0.14)');
        mouthGrad.addColorStop(1, 'rgba(0, 242, 254, 0)');
        ctx.fillStyle = mouthGrad;
        ctx.beginPath();
        ctx.ellipse(basket.x, netTopY, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Metallic / Glowing Rim Ring
        ctx.strokeStyle = basket.pulse > 0 ? '#ffd700' : '#00f2fe';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = basket.pulse > 0 ? '#ffd700' : '#00f2fe';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(basket.x, netTopY, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.ellipse(basket.x, netTopY, rx * 0.93, ry * 0.88, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 4. Net HUD Pill below pocket
        const basketLabel = `🧺 FISHING NET: ${fishesInBasket} / 20 FISH`;
        ctx.font = `bold ${Math.round(12 * Math.max(sc, 0.7))}px Inter, sans-serif`;
        const btm = ctx.measureText(basketLabel);
        const bW = btm.width + Math.round(24 * sc);
        const bH = Math.round(26 * Math.max(sc, 0.7));
        const bX = basket.x - bW / 2;
        const bY = bagBottomY + Math.round(12 * sc);

        ctx.fillStyle = 'rgba(10, 18, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(bX, bY, bW, bH, 13);
        ctx.fill();
        ctx.strokeStyle = fishesInBasket >= 20 ? '#ffd700' : 'rgba(0, 242, 254, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = fishesInBasket >= 20 ? '#ffd700' : '#00f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(basketLabel, basket.x, bY + bH / 2);
        ctx.restore();

        // ── 2. FLOATING TEXTS & SCORE POPUPS ────────────────────
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
          const ft = floatingTexts[i];
          ft.y += ft.vy * dt;
          ft.alpha -= 0.012 * dt;
          if (ft.alpha <= 0) {
            floatingTexts.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, ft.alpha);
          ctx.font = `bold ${Math.round(14 * Math.max(sc, 0.7))}px Inter, sans-serif`;
          ctx.fillStyle = ft.color;
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
        }

        // ── 3. CELEBRATION CONFETTI FIREWORKS ───────────────────
        for (let i = confettis.length - 1; i >= 0; i--) {
          const cf = confettis[i];
          cf.x += cf.vx * dt;
          cf.y += cf.vy * dt;
          cf.vy += 0.08 * dt; // gravity
          cf.alpha -= 0.006 * dt;
          if (cf.alpha <= 0 || cf.y > height + 50) {
            confettis.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, cf.alpha);
          ctx.fillStyle = cf.color;
          ctx.translate(cf.x, cf.y);
          ctx.rotate((cf.x + cf.y) * 0.05);
          ctx.fillRect(-cf.size / 2, -cf.size / 2, cf.size, cf.size * 1.5);
          ctx.restore();
        }

        // ── 4. SEA CATCH GAME HUD OVERLAY ───────────────────────
        ctx.save();
        // Top-right scoreboard HUD
        const hudW = Math.min(320 * sc, width - 32);
        const hudH = Math.round(46 * Math.max(sc, 0.7));
        const hudX = width - hudW - Math.round(16 * sc);
        const hudY = Math.round(12 * sc);

        ctx.fillStyle = 'rgba(10, 15, 35, 0.82)';
        ctx.beginPath();
        ctx.roundRect(hudX, hudY, hudW, hudH, Math.round(23 * sc));
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.font = `bold ${Math.round(13 * Math.max(sc, 0.7))}px Inter, sans-serif`;
        ctx.fillStyle = '#00f2fe';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🎮 CATCH: ${fishesInBasket}/20`, hudX + Math.round(14 * sc), hudY + hudH / 2);

        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'right';
        ctx.fillText(`🏆 SCORE: ${gameScore} PTS`, hudX + hudW - Math.round(14 * sc), hudY + hudH / 2);
        ctx.restore();

        // ── 5. VICTORY EXPLOSION CELEBRATION BANNER ─────────────
        if (isCelebrating) {
          celebrationTimer -= dt;
          if (celebrationTimer <= 0) {
            isCelebrating = false;
          } else {
            ctx.save();
            const cardW = Math.min(width - 40, 520);
            const cardH = Math.round(130 * Math.max(sc, 0.7));
            const cardX = (width - cardW) / 2;
            const cardY = (height - cardH) / 2 - Math.round(30 * sc);

            ctx.fillStyle = 'rgba(8, 14, 34, 0.94)';
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardW, cardH, Math.round(20 * sc));
            ctx.fill();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${Math.round(22 * Math.max(sc, 0.7))}px Inter, sans-serif`;
            ctx.fillText('🎉 NATIONAL SEA CHALLENGE MASTER! 🎉', width / 2, cardY + Math.round(42 * sc));

            ctx.fillStyle = '#00f2fe';
            ctx.font = `${Math.round(14 * Math.max(sc, 0.7))}px Inter, sans-serif`;
            ctx.fillText(`Final Challenge Score: ${gameScore} PTS — Click anywhere to play again!`, width / 2, cardY + Math.round(88 * sc));
            ctx.restore();
          }
        }

        this.matrixAnimFrame = requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });
  }

  restartMatrixRain(): void {
    if (this.matrixAnimFrame) return;
    this.startMatrixRain();
  }

  scrollToSection(sectionId: string): void {
    if (typeof document !== 'undefined') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // ── FLOATING FAB ────────────────────────────────────────────
  setupFabScroll(): void {
    if (typeof window === 'undefined') return;
    // Use RAF throttling to avoid triggering Angular CD on every scroll pixel
    let rafPending = false;
    this.fabScrollListener = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const visible = window.scrollY > 400;
        if (visible !== this.fabVisible) {
          this.ngZone.run(() => { this.fabVisible = visible; });
        }
      });
    };
    window.addEventListener('scroll', this.fabScrollListener, { passive: true });
  }

  // ── TRACK CODE PREVIEW & ARENA SIMULATION ─────────────────────
  navigateToRegistration(track: string | null = null): void {
    const selectedTrack = track || this.activeTrackPreview || null;
    if (this.codeTypeInterval) clearInterval(this.codeTypeInterval);
    if (this.arenaInterval) clearInterval(this.arenaInterval);
    this.isTrackModalOpen = false;
    this.activeTrackPreview = null;
    if (selectedTrack) {
      this.router.navigate(['/registration'], { queryParams: { track: selectedTrack } });
    } else {
      this.router.navigate(['/registration']);
    }
  }

  setTrackPreview(track: string | null, openModal = true): void {
    this.activeTrackPreview = track;
    if (this.codeTypeInterval) clearInterval(this.codeTypeInterval);
    if (this.arenaInterval) clearInterval(this.arenaInterval);

    if (!track) {
      this.isTrackModalOpen = false;
      this.typedCodePreview = '';
      return;
    }
    if (openModal) {
      this.isTrackModalOpen = true;
    }
    this.typedCodePreview = '';
    const raw = this.trackCodeSnippets[track] || '';
    let i = 0;
    this.ngZone.runOutsideAngular(() => {
      this.codeTypeInterval = setInterval(() => {
        i += 2;
        if (i >= raw.length) {
          clearInterval(this.codeTypeInterval);
          this.ngZone.run(() => { this.typedCodePreview = this.syntaxHighlight(raw); });
        } else {
          const partial = raw.substring(0, i);
          this.ngZone.run(() => {
            this.typedCodePreview = this.syntaxHighlight(partial) + '<span class="cursor-blink">▋</span>';
          });
        }
      }, 12);

      this.arenaInterval = setInterval(() => {
        this.ngZone.run(() => {
          if (track === 'robotics' && this.arenaState.robotics.mode === 'Autonomous') {
            this.arenaState.robotics.radarSweep = (this.arenaState.robotics.radarSweep + 30) % 360;
            const dist = Math.floor(Math.random() * 18) + 18; // 18-35cm
            this.arenaState.robotics.distance = dist;
            if (dist > 20) {
              this.arenaState.robotics.status = '🟢 RADAR SCANNING • PATH CLEAR';
              this.arenaState.robotics.statusColor = '#00e676';
            }
          } else if (track === 'coding') {
            const ops = (Math.random() * 0.4 + 2.2).toFixed(1);
            this.arenaState.coding.opsSec = `${ops}M ops/s`;
          } else if (track === 'cyber') {
            const pkts = Math.floor(Math.random() * 400) + 4000;
            this.arenaState.cyber.packetsSec = pkts;
          } else if (track === 'innovation') {
            const kw = (Math.random() * 1.5 + 46.0).toFixed(1);
            this.arenaState.innovation.solarKw = kw;
          }
        });
      }, 1500);
    });
  }

  cargoBarWidth(): number {
    const cargo = this.arenaState?.robotics?.cargo;
    if (!cargo || cargo === 'None') return 0;
    return 80;
  }

  getRoverLeft(): number {
    return (this.arenaState.robotics && this.arenaState.robotics.posX !== undefined)
      ? this.arenaState.robotics.posX
      : 50;
  }

  getRoverTop(): number {
    return (this.arenaState.robotics && this.arenaState.robotics.posY !== undefined)
      ? this.arenaState.robotics.posY
      : 50;
  }

  getRoverTransform(): string {
    const angle = (this.arenaState.robotics && this.arenaState.robotics.angle !== undefined)
      ? this.arenaState.robotics.angle
      : 90;
    return `translate(-50%, -50%) rotate(${angle - 90}deg)`;
  }

  triggerArenaAction(track: string, actionType: string): void {
    const state = this.arenaState[track];
    if (!state) return;

    if (track === 'robotics') {
      const currentAngle = state.angle !== undefined ? state.angle : 90;

      if (actionType === 'left' || actionType === 'turn_left') {
        state.angle = (currentAngle - 45 + 360) % 360;
        state.statusColor = '#0088cc';
        state.log = `Turned left 45° — heading ${state.angle}°`;
      } else if (actionType === 'right' || actionType === 'turn_right') {
        state.angle = (currentAngle + 45) % 360;
        state.statusColor = '#0088cc';
        state.log = `Turned right 45° — heading ${state.angle}°`;
      } else if (actionType === 'forward') {
        const rad = (currentAngle - 90) * (Math.PI / 180);
        const step = 8;
        const dx = Math.round(Math.sin(rad) * step);
        const dy = Math.round(-Math.cos(rad) * step);
        state.posX = Math.max(8, Math.min(92, (state.posX || 50) + dx));
        state.posY = Math.max(12, Math.min(88, (state.posY || 50) + dy));
        state.motorSpeed = 95;
        state.statusColor = '#00e676';
        state.log = `Driving forward (heading ${currentAngle}°) — position (${state.posX}%, ${state.posY}%)`;
      } else if (actionType === 'reverse') {
        const rad = (currentAngle - 90) * (Math.PI / 180);
        const step = 8;
        const dx = Math.round(Math.sin(rad) * step);
        const dy = Math.round(-Math.cos(rad) * step);
        state.posX = Math.max(8, Math.min(92, (state.posX || 50) - dx));
        state.posY = Math.max(12, Math.min(88, (state.posY || 50) - dy));
        state.motorSpeed = 70;
        state.statusColor = '#38bdf8';
        state.log = `Reversing (heading ${currentAngle}°) — position (${state.posX}%, ${state.posY}%)`;
      } else if (actionType === 'stop') {
        state.motorSpeed = 0;
        state.statusColor = '#ffea00';
        state.log = 'Halted — radar monitoring perimeter';
      } else if (actionType === 'claw') {
        state.clawOpen = !state.clawOpen;
        state.armAnimating = true;
        setTimeout(() => { state.armAnimating = false; }, 800);

        if (state.clawOpen) {
          state.cargo = 'Stone';
          state.obstacleStatus = 'Loaded on Rover';
          state.statusColor = '#00e676';
          state.log = 'Robotic arm extended — stone grabbed and loaded onto rover cargo bay';
        } else {
          state.obstacleX = state.posX || 50;
          state.obstacleY = state.posY || 50;
          state.cargo = 'None';
          if ((state.posX || 0) > 68) {
            state.obstacleStatus = 'Delivered to Flag 🏁';
            state.missionSuccess = true;
            setTimeout(() => { state.missionSuccess = false; }, 6000);
          } else {
            state.obstacleStatus = `Placed at (${state.obstacleX}%, ${state.obstacleY}%)`;
          }
          state.statusColor = '#38bdf8';
          state.log = `Robotic arm released stone onto arena floor at (${state.obstacleX}%, ${state.obstacleY}%)`;
        }
      } else if (actionType === 'obstacle') {
        const randX = Math.floor(Math.random() * 35) + 22;
        const randY = Math.floor(Math.random() * 30) + 22;
        state.distance = Math.floor(Math.random() * 8) + 8;
        state.angle = 135;
        state.motorSpeed = 45;
        state.obstacleX = randX;
        state.obstacleY = randY;
        state.obstacleStatus = 'Target Stone';
        state.statusColor = '#ffab00';
        state.log = `🪨 Stone spawned at (${randX}%, ${randY}%) — ready to grab`;
      } else if (actionType === 'autopilot') {
        while (this.autopilotTimers.length > 0) {
          clearTimeout(this.autopilotTimers.pop());
        }

        const sX = state.obstacleX || 35;
        const sY = state.obstacleY || 35;
        const fX = 78, fY = 40, stX = 12, stY = 75;

        state.missionSuccess = false;
        state.posX = stX;
        state.posY = stY;
        state.angle = 270;
        state.obstacleStatus = 'LiDAR Target Locked';
        state.clawOpen = false;
        state.cargo = 'None';
        state.motorSpeed = 70;
        state.statusColor = '#38bdf8';
        state.log = `Autopilot Engaged — navigating to stone at (${sX}%, ${sY}%)`;

        const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
        const stepMs = 550;
        let ms = 0;
        let idx = 0;

        const addStep = (delay: number, fn: () => void) => {
          this.autopilotTimers.push(setTimeout(fn, delay));
        };

        // ── APPROACH: start → stone ──
        const approachLogs = [
          '⬆️ Moving up — approaching stone...',
          '⬆️ Gaining elevation — stone on sensors...',
          '⬆️ Closing vertical distance...',
          '↗️ Angling toward stone position...',
          '↗️ Adjusting trajectory...',
          '➡️ Lining up with target...',
          '➡️ Slow approach — proximity alert...',
          '📍 Stone dead ahead — final approach...',
        ];
        for (let i = 0; i < 8; i++) {
          const t = (i + 1) / 9;
          addStep(ms += stepMs, () => {
            state.posX = lerp(stX, sX, t);
            state.posY = lerp(stY, sY + 3, t);
            state.motorSpeed = Math.max(5, 70 - i * 8);
            if (i < 3) state.angle = 270;
            else if (i < 5) state.angle = 315;
            else state.angle = 0;
            state.log = approachLogs[i] || '➡️ Approaching...';
          });
        }

        // ── GRAB ──
        addStep(ms += 700, () => {
          state.motorSpeed = 0; state.clawOpen = true;
          state.armAnimating = true;
          state.log = '🔧 Extending arm — gripping stone...';
        });
        addStep(ms += 800, () => {
          state.armAnimating = false; state.cargo = 'Stone';
          state.obstacleStatus = 'Loaded on Rover';
          state.statusColor = '#00e676';
          state.log = '✅ Stone secured — routing to flag...';
        });

        // ── DEPARTURE ──
        addStep(ms += 800, () => {
          state.angle = 90; state.motorSpeed = 50;
          state.log = '🔃 Reversing — backing away from stone...';
        });
        addStep(ms += 600, () => {
          state.posX = lerp(sX, stX, 0.5); state.posY = sY;
          state.log = '↩️ Cleared stone position — plotting course to flag...';
        });

        // ── TRANSIT: stone → flag ──
        const transitLogs = [
          '➡️ Heading East toward flag...',
          '➡️ Crossing arena midpoint...',
          '➡️ Flag beacon signal detected...',
          '➡️ Closing distance to flag...',
          '📍 Final approach approach...',
          '📍 Lining up with flag position...',
          '🏁 At destination flag!',
        ];
        for (let i = 0; i < 7; i++) {
          const t = (i + 1) / 8;
          addStep(ms += stepMs, () => {
            state.posX = lerp(sX, fX, t);
            state.posY = lerp(sY + 2, fY, t);
            state.motorSpeed = Math.max(5, 55 - i * 7);
            state.angle = 180;
            state.log = transitLogs[i];
          });
        }

        // ── DROP ──
        addStep(ms += 700, () => {
          state.motorSpeed = 0; state.armAnimating = true;
          state.log = '🔧 Extending arm to unload stone at flag...';
        });
        addStep(ms += 800, () => {
          state.armAnimating = false; state.clawOpen = false;
          state.cargo = 'None'; state.obstacleX = fX;
          state.obstacleY = fY; state.obstacleStatus = 'Delivered to Flag 🏁';
          state.missionSuccess = true;
          state.status = '🎉 MISSION COMPLETE! Stone delivered to flag!';
          state.statusColor = '#10b981';
          state.log = '✅ Stone delivered. Autopilot mission executed with 100% precision!';
        });

        this.autopilotTimers.push(setTimeout(() => {
          state.missionSuccess = false;
        }, ms + 7000));
      }

      // Automatically recalculate obstacle proximity distance
      const dx = (state.posX || 50) - (state.obstacleX || 25);
      const dy = (state.posY || 50) - (state.obstacleY || 35);
      state.distance = Math.max(5, Math.round(Math.sqrt(dx * dx + dy * dy) * 0.85));
    } else if (track === 'coding') {
      if (actionType === 'sort-age-asc') {
        state.people = [...state.people].sort((a: any, b: any) => a.age - b.age);
        state.sortField = 'age-asc';
        state.status = `// Sorted by age (ascending) — youngest to oldest.`;
        state.statusColor = '#00e676';
        state.log = `> ${state.people[0].name} (${state.people[0].age}) → ${state.people[state.people.length - 1].name} (${state.people[state.people.length - 1].age})`;
        state.code = `people.sort((a, b) => a.age - b.age);
console.table(people);
// Youngest: ${state.people[0].name} (${state.people[0].age})
// Oldest: ${state.people[state.people.length - 1].name} (${state.people[state.people.length - 1].age})`;
      } else if (actionType === 'sort-age-desc') {
        state.people = [...state.people].sort((a: any, b: any) => b.age - a.age);
        state.sortField = 'age-desc';
        state.status = `// Sorted by age (descending) — oldest to youngest.`;
        state.statusColor = '#a855f7';
        state.log = `> ${state.people[0].name} (${state.people[0].age}) → ${state.people[state.people.length - 1].name} (${state.people[state.people.length - 1].age})`;
        state.code = `people.sort((a, b) => b.age - a.age);
console.table(people);
// Oldest: ${state.people[0].name} (${state.people[0].age})
// Youngest: ${state.people[state.people.length - 1].name} (${state.people[state.people.length - 1].age})`;
      } else if (actionType === 'sort-gender') {
        state.people = [...state.people].sort((a: any, b: any) => {
          if (a.gender === b.gender) return a.age - b.age;
          return a.gender === 'male' ? -1 : 1;
        });
        state.sortField = 'gender';
        state.status = `// Sorted by gender — males first, then females.`;
        state.statusColor = '#38bdf8';
        const maleCount = state.people.filter((p: any) => p.gender === 'male').length;
        const femaleCount = state.people.filter((p: any) => p.gender === 'female').length;
        state.log = `> ${maleCount} males · ${femaleCount} females — grouped by gender`;
        state.code = `people.sort((a, b) => {
  if (a.gender === b.gender) return a.age - b.age;
  return a.gender === 'male' ? -1 : 1;
});
// ${maleCount} males · ${femaleCount} females`;
      } else if (actionType === 'shuffle') {
        const arr = [...state.people];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        state.people = arr;
        state.sortField = 'none';
        state.status = '// Grid shuffled randomly. Try a sort method!';
        state.statusColor = '#f59e0b';
        state.log = '> People positions randomized — choose a sort below.';
        state.code = `// Fisher-Yates shuffle
for (let i = people.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [people[i], people[j]] = [people[j], people[i]];
}
// Positions randomized!`;
      }
    } else if (track === 'ai') {
      if (actionType.startsWith('sample_')) {
        if (actionType === 'sample_cocoa') {
          state.sampleIcon = '🌿'; state.sampleName = 'Cocoa Pod'; state.label = 'Cocoa Pod • Healthy (Class 0)'; state.confidence = '99.2'; state.status = '🟢 CROP DIAGNOSTIC • HEALTHY'; state.statusColor = '#00e676';
        } else if (actionType === 'sample_maize') {
          state.sampleIcon = '🌽'; state.sampleName = 'Maize Leaf'; state.label = 'Maize • Rust Mildew Detected (Class 1)'; state.confidence = '97.8'; state.status = '⚠️ CROP PATHOLOGY • RUST MILDEW'; state.statusColor = '#ff9100';
        } else if (actionType === 'sample_potato') {
          state.sampleIcon = '🥔'; state.sampleName = 'Potato Tuber'; state.label = 'Potato • Blight Virus Alert (Class 2)'; state.confidence = '98.5'; state.status = '🚨 CROP PATHOLOGY • BLIGHT DETECTED'; state.statusColor = '#ff1744';
        } else if (actionType === 'sample_tomato') {
          state.sampleIcon = '🍅'; state.sampleName = 'Tomato Leaf'; state.label = 'Tomato • Septoria Leaf Spot (Class 3)'; state.confidence = '96.4'; state.status = '⚠️ CROP PATHOLOGY • LEAF SPOT'; state.statusColor = '#ff9100';
        }
        state.log = `Loaded ${state.sampleName} into visual scanner. ResNet-50 inferred classification with ${state.confidence}% confidence.`;
      } else if (actionType === 'scan') {
        // Re-scan the currently selected sample (not random)
        const currentIcon = state.sampleIcon;
        const sampleMap: Record<string, string> = {
          '🌿': 'sample_cocoa',
          '🌽': 'sample_maize',
          '🥔': 'sample_potato',
          '🍅': 'sample_tomato'
        };
        const currentSample = sampleMap[currentIcon] || 'sample_cocoa';
        state.status = '🔍 Scanning crop sample...';
        state.statusColor = '#ab47bc';
        state.log = 'Running AI inference on leaf image. Analyzing texture, color, and pattern...';
        if (this.scanTimeout) clearTimeout(this.scanTimeout);
        this.scanTimeout = setTimeout(() => this.triggerArenaAction('ai', currentSample), 900);
      } else if (actionType === 'epoch') {
        state.epoch = Math.min(50, state.epoch + 1);
        const e = state.epoch;

        // Accuracy: 25% base, climbs ~ logistically to 99%
        const acc = Math.round((25 + 74 * (1 - Math.exp(-e / 14))) * 10) / 10;
        state.accuracy = acc;

        // Loss: starts at 2.3026, decays exponentially
        const lossVal = 2.3026 * Math.exp(-e / 10) + 0.008;
        state.loss = lossVal.toFixed(4);

        // Build confusion matrix from current accuracy
        const diag = Math.round(acc);
        const offA = Math.max(0, Math.round((100 - diag) * 0.5));
        const offB = Math.max(0, Math.round((100 - diag - offA) * 0.6));
        const vary = (i: number) => Math.round((i - 1.5) * 1.8);
        state.confusionMatrix = ([0, 1, 2, 3] as number[]).map((r: number) => {
          const d = Math.min(99, Math.max(10, diag + vary(r)));
          const a = Math.max(0, offA - vary(r) * 0.3);
          const b = Math.max(0, offB + vary(r) * 0.2);
          const c = Math.max(0, 100 - d - a - b);
          const row: number[] = [0, 0, 0, 0];
          row[r] = d;
          const offIdx: number[] = [0, 1, 2, 3].filter((i: number) => i !== r);
          row[offIdx[0]] = Math.round(a);
          row[offIdx[1]] = Math.round(b);
          row[offIdx[2]] = Math.round(c);
          return row;
        });

        // Per-class metrics from confusion matrix
        state.classPrecision = state.confusionMatrix.map((row: number[], ci: number) => {
          const colSum = state.confusionMatrix.reduce((s: number, r: number[]) => s + r[ci], 0);
          return colSum > 0 ? Math.round((row[ci] / colSum) * 100) + '%' : '0%';
        });
        state.classRecall = state.confusionMatrix.map((row: number[], ri: number) => {
          const rowSum = row.reduce((s: number, v: number) => s + v, 0);
          return rowSum > 0 ? Math.round((row[ri] / rowSum) * 100) + '%' : '0%';
        });
        state.classF1 = state.classPrecision.map((p: string, i: number) => {
          const pNum = parseInt(p);
          const rNum = parseInt(state.classRecall[i]);
          return (pNum + rNum) > 0 ? Math.round(2 * pNum * rNum / (pNum + rNum)) + '%' : '0%';
        });

        // Status & log
        const good = acc >= 90 ? '🔥' : acc >= 70 ? '📈' : acc >= 50 ? '⚡' : '🔄';
        state.status = `${good} EPOCH ${e}/50 • ACC ${acc}% • LOSS ${state.loss}`;
        state.statusColor = acc >= 90 ? '#00e676' : acc >= 70 ? '#38bdf8' : acc >= 50 ? '#ff9100' : '#ab47bc';
        const direction = lossVal < 0.05 ? 'converged' : lossVal < 0.3 ? 'improving' : 'descending';
        state.log = `Backprop complete. Training loss ${direction} to ${state.loss}. Accuracy climbing (${acc}%).`;
      }
    } else if (track === 'cyber') {
      if (actionType === 'defend') {
        state.blockedCount += Math.floor(Math.random() * 5) + 3;
        state.packetsSec = Math.floor(Math.random() * 1500) + 5000;
        state.status = '🛡️ SQL INJECTION ATTEMPT NEUTRALIZED';
        state.statusColor = '#00e676';
        state.log = `Sandboxed firewall intercepted SQLi payload before query execution. Total blocked: ${state.blockedCount}.`;
      } else if (actionType === 'ddos') {
        state.packetsSec = 1200;
        state.status = '⚡ DDOS SCRUBBING FILTER ENGAGED';
        state.statusColor = '#38bdf8';
        state.log = 'BGP Anycast routing diverted 40 Gbps volumetric SYN flood into scrubbing centers. Traffic normal.';
      } else if (actionType === 'honeypot') {
        state.blockedCount += 1;
        state.status = '🍯 HONEYPOT TRAP SPRUNG • IP ISOLATED';
        state.statusColor = '#ffea00';
        state.log = 'Attacker probed decoy server on Port 22. Attacker IP 192.168.4.99 logged and permanently blacklisted.';
      } else if (actionType === 'cipher') {
        const ciphers = ['AES-256-GCM -> RSA-4096', 'ChaCha20-Poly1305', 'Elliptic Curve ECDH', 'Quantum-Resistant Kyber-1024'];
        state.encryption = ciphers[Math.floor(Math.random() * ciphers.length)];
        state.status = '🔐 QUANTUM CIPHER KEYS ROTATED';
        state.statusColor = '#0088cc';
        state.log = `Active encryption cipher rotated to ${state.encryption}. Zero session interruption.`;
      }
    } else if (track === 'innovation') {
      if (actionType === 'solar') {
        const currentSolar = parseFloat(state.solarKw || '46.8');
        state.solarKw = (currentSolar + Math.random() * 6 + 2).toFixed(1);
        state.battery = Math.min(100, state.battery + 4);
        state.status = '☀️ SOLAR TRACKING TILTED +15° • PEAK GENERATION';
        state.statusColor = '#00e676';
        state.log = `Solar panels tilted +15° toward sun. Array output surged to ${state.solarKw} kW. Battery storage at ${state.battery}%.`;
      } else if (actionType === 'wind') {
        const currentWind = parseFloat(state.windKw || '14.2');
        state.windKw = (currentWind + Math.random() * 4 + 1).toFixed(1);
        state.status = '💨 TURBINE PITCH ANGLE BOOSTED';
        state.statusColor = '#38bdf8';
        state.log = `Wind turbine blade pitch angle optimized. Wind output increased to ${state.windKw} kW.`;
      } else if (actionType === 'hospital') {
        if (state.hospitalPower === 'Emergency Ward Boosted (120%)') {
          state.hospitalPower = 'Normal (100%)';
          state.status = '🏥 Hospital returned to normal grid power';
          state.statusColor = '#ffea00';
          state.log = `Hospital reverted to normal. Battery preserved at ${state.battery}%.`;
        } else if ((state.battery || 0) < 15) {
          state.status = '⚠️ NOT ENOUGH BATTERY — Generate more power first';
          state.statusColor = '#ff1744';
          state.log = `Cannot boost hospital — battery is at ${state.battery}%. Use Solar or Wind to charge.`;
        } else {
          state.hospitalPower = 'Emergency Ward Boosted (120%)';
          state.battery = Math.max(0, state.battery - 15);
          state.co2Saved += Math.floor(Math.random() * 20) + 10;
          state.status = '🏥 EMERGENCY WARD BOOSTED — 25 kW CLEAN POWER DIRECTED';
          state.statusColor = '#00e676';
          state.log = `Redirected 25 kW from battery to ICU. Battery dropped to ${state.battery}%. CO₂ savings increased.`;
        }
      } else if (actionType === 'sync') {
        const currentEfficiency = parseFloat(state.efficiency || '98.5');
        state.efficiency = Math.min(99.9, currentEfficiency + Math.random() * 0.3 + 0.1).toFixed(1) + '%';
        state.co2Saved += Math.floor(Math.random() * 60) + 30;
        state.status = '🌍 IOT SMART GRID FULLY SYNCHRONIZED';
        state.statusColor = '#00a86b';
        state.log = `Total carbon emission reduction offset reached ${state.co2Saved} kg across 16 synchronized municipal IoT nodes.`;
      }
    }
  }

    private syntaxHighlight(code: string): string {
    return code
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(#(?!include|define)[^\n]+)/g, "<span class='c-comment'>$1</span>")
      .replace(/(#(?:include|define)\b[^\n]*)/g, "<span class='c-kw'>$1</span>")
      .replace(/\b(def|return|import|from|for|in|if|else|print|void|int|const|let|export|default|function|class|new|extends|useState|useEffect)\b/g,
               "<span class='c-kw'>$1</span>")
      .replace(/("([^"]*)")/g, "<span class='c-str'>$1</span>")
      .replace(/\b(\d+\.?\d*)\b/g, "<span class='c-num'>$1</span>");
  }

  // ── CODING CHALLENGE WIDGET ─────────────────────────────────
  typeProblem(): void {
    if (this.problemTypeInterval) clearInterval(this.problemTypeInterval);
    this.typedProblem = '';
    this.challengeResult = null;
    this.hintVisible = false;
    this.showSolution = false;
    this.userCode = '';
    const full = this.currentChallenge.problem;
    let i = 0;
    this.ngZone.runOutsideAngular(() => {
      this.problemTypeInterval = setInterval(() => {
        i += 2;
        if (i >= full.length) {
          clearInterval(this.problemTypeInterval);
          this.ngZone.run(() => { this.typedProblem = full; });
        } else {
          this.ngZone.run(() => { this.typedProblem = full.substring(0, i); });
        }
      }, 18);
    });
  }

  nextChallenge(): void {
    this.currentChallengeIndex = (this.currentChallengeIndex + 1) % this.filteredChallenges.length;
    this.showSolution = false;
    this.typeProblem();
  }

  onCodeInput(): void {
    const lines = this.userCode.split('\n').length;
    this.codeLineNumbers = Array.from({ length: Math.max(6, lines) }, (_, i) => i + 1);
    this.challengeResult = null;
  }

  runChallenge(): void {
    if (!this.userCode.trim()) {
      this.challengeResult = false;
      this.challengeResultMessage = 'Please write some code first.';
      return;
    }
    this.isChallengeRunning = true;
    this.challengeResult = null;
    setTimeout(() => {
      const passed = this.currentChallenge.validator(this.userCode);
      this.isChallengeRunning = false;
      this.challengeResult = passed;
      if (passed) {
        this.sessionSolvedToday++;
        this.sessionPoints += this.currentChallenge.points;
      } else {
        this.challengeResultMessage = 'Not quite right. Check your logic or use the hint!';
      }
    }, 900);
  }

  showHint(): void {
    this.hintVisible = !this.hintVisible;
  }

  toggleSolution(): void {
    this.showSolution = !this.showSolution;
  }

  openPreview(): void {
    const html = this.userCode.trim();
    if (!html) return;
    this.showPreviewModal = true;
    setTimeout(() => {
      if (this.previewFrameRef?.nativeElement) {
        this.renderer.setProperty(this.previewFrameRef.nativeElement, 'srcdoc', html);
      }
    });
  }

  closePreview(): void {
    this.showPreviewModal = false;
  }

  // ── GHANA REGION MAP ─────────────────────────────────────────
  activeMapFilter: string = 'All';
  mapFilters = ['All', 'Robotics', 'Coding', 'AI', 'Cybersecurity', 'Innovation'];

  regionalHubs = [
    { id: 'greater-accra', x: 208, y: 308, name: 'Accra Hub' },
    { id: 'ashanti',       x: 160, y: 220, name: 'Kumasi Hub' },
    { id: 'central',       x: 145, y: 300, name: 'Cape Coast Hub' },
    { id: 'eastern',       x: 205, y: 260, name: 'Koforidua Hub' },
    { id: 'western',       x: 85,  y: 265, name: 'Takoradi Hub' },
    { id: 'volta',         x: 270, y: 240, name: 'Ho Hub' },
    { id: 'northern',      x: 195, y: 115, name: 'Tamale Hub' },
    { id: 'bono',          x: 130, y: 180, name: 'Sunyani Hub' },
    { id: 'western-north', x: 100, y: 205, name: 'Sefwi Wiawso Hub' },
    { id: 'bono-east',     x: 190, y: 165, name: 'Techiman Hub' },
    { id: 'ahafo',         x: 145, y: 185, name: 'Goaso Hub' },
    { id: 'oti',           x: 255, y: 175, name: 'Dambai Hub' },
    { id: 'savannah',      x: 105, y: 100, name: 'Damongo Hub' },
    { id: 'north-east',    x: 250, y: 85,  name: 'Nalerigu Hub' },
    { id: 'upper-west',    x: 85,  y: 55,  name: 'Wa Hub' },
    { id: 'upper-east',    x: 195, y: 45,  name: 'Bolgatanga Hub' }
  ];

  hoverRegion(id: string | null): void {
    if (!id) { this.hoveredRegionData = null; return; }
    this.hoveredRegionData = this.regionDataList.find(r => r.id === id) || null;
  }

  selectRegion(id: string | null): void {
    if (!id) {
      this.selectedRegion = null;
      this.hoveredRegionData = null;
    } else {
      this.selectedRegion = this.selectedRegion === id ? null : id;
      this.hoveredRegionData = this.regionDataList.find(r => r.id === id) || null;
    }
    if (typeof document === 'undefined') return;
    const paths = this.elementRef.nativeElement.querySelectorAll('.gh-region');
    paths.forEach((p: any) => {
      p.classList.remove('selected');
      if (p.id === this.selectedRegion) p.classList.add('selected');
    });
  }

  setMapFilter(filter: string): void {
    this.activeMapFilter = filter;
    if (typeof document === 'undefined') return;
    const paths = this.elementRef.nativeElement.querySelectorAll('.gh-region');
    paths.forEach((p: any) => {
      const rd = this.regionDataList.find(r => r.id === p.id);
      if (!rd) return;
      if (filter === 'All' || rd.specialty.includes(filter)) {
        p.style.opacity = '1';
        p.style.filter = filter !== 'All' ? 'drop-shadow(0 0 15px rgba(0, 242, 254, 0.8))' : 'none';
      } else {
        p.style.opacity = '0.25';
        p.style.filter = 'none';
      }
    });
  }

  getSelectedRegionData(): any {
    if (!this.selectedRegion) return null;
    return this.regionDataList.find(r => r.id === this.selectedRegion) || null;
  }

  getQualificationHeat(rd: any): number {
    if (!rd) return 0;
    return Math.min(98, Math.max(75, 70 + Math.round((rd.schools / 42) * 28)));
  }

  triggerRegionAction(rd: any): void {
    alert(`🎉 Launching Regional Heats & Squad Directory for ${rd.name}!\nTop School: ${rd.topSchool}\nActive Squads: ${rd.schools * 4} teams competing!`);
  }

  getRegionColor(schools: number): string {
    if (schools === 0) return 'rgba(255, 255, 255, 0.08)';
    const max = 42; const min = 4;
    const t = Math.min(1, Math.max(0, (schools - min) / (max - min)));
    if (t < 0.5) {
      const p = t * 2;
      const r = Math.round(24 + p * (0 - 24));
      const g = Math.round(78 + p * (210 - 78));
      const b = Math.round(160 + p * (255 - 160));
      return `rgb(${r},${g},${b})`;
    } else {
      const p = (t - 0.5) * 2;
      const r = Math.round(0 + p * (255 - 0));
      const g = Math.round(210 + p * (180 - 210));
      const b = Math.round(255 + p * (0 - 255));
      return `rgb(${r},${g},${b})`;
    }
  }

  applyRegionColors(): void {
    if (typeof document === 'undefined') return;
    this.regionDataList.forEach(rd => {
      const el = this.elementRef.nativeElement.querySelector(`#${rd.id}`) as SVGPathElement;
      if (el) {
        el.style.fill = this.getRegionColor(rd.schools);
        el.style.fillOpacity = '0.75';
      }
    });
  }
}
