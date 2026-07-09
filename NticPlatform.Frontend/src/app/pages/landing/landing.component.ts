import { Component, OnInit, AfterViewInit, OnDestroy, NgZone, ElementRef, ViewChild } from '@angular/core';
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

  // Harvard-style interactive states
  isSearchOpen = false;
  searchQuery = '';
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

  arenaState: any = {
    robotics: {
      distance: 24,
      angle: 45,
      motorSpeed: 85,
      mode: 'Autonomous',
      radarSweep: 0,
      posX: 50,
      posY: 50,
      clawOpen: false,
      cargo: 'None',
      status: 'RADAR SCANNING • PATH CLEAR',
      statusColor: '#00e676',
      log: 'Ultrasonic echo return: 24cm. Proceeding forward at 85% RPM.'
    },
    coding: {
      benchmarkMs: '0.38',
      complexity: 'O(N log N)',
      memory: '14.2 MB',
      opsSec: '2.4M ops/s',
      bars: [35, 60, 25, 85, 45, 95, 50, 75, 30, 90, 65, 80],
      sortAlgo: 'QuickSort O(N log N)',
      isSorting: false,
      status: 'BENCHMARK PASSED • ZERO MEMORY LEAKS',
      statusColor: '#0088cc',
      log: 'DP memoization table computed for 1,000 subproblems in 0.38ms.'
    },
    ai: {
      confidence: 98.4,
      epoch: 45,
      loss: '0.0123',
      label: 'Cocoa Pod • Healthy (Class 0)',
      sampleIcon: '🌿',
      sampleName: 'Cocoa Pod',
      gpuLoad: '74%',
      status: 'INFERENCE CONVERGED • 98.4% ACCURACY',
      statusColor: '#ab47bc',
      log: 'ResNet-18 vision pipeline classified crop leaf sample in 14ms.'
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
  challenges = [
    {
      title: 'challenge_01.py', track: 'Coding', difficulty: 'Easy',
      timeLimit: '15 min', solvedCount: 342, successRate: 78, points: 50,
      problem: 'Write a function that returns the reverse of a string.\nExample: reverse("Ghana") → "anahG"',
      hint: 'Use Python slicing: s[::-1] reverses any sequence.',
      validator: (code: string) => /\[::-1\]|reversed|join/.test(code)
    },
    {
      title: 'challenge_02.py', track: 'Coding', difficulty: 'Medium',
      timeLimit: '20 min', solvedCount: 218, successRate: 62, points: 100,
      problem: 'Find the largest sum of any contiguous subarray.\nExample: maxSubarray([-2,1,-3,4,-1,2,1,-5,4]) → 6',
      hint: "Kadane's algorithm: track current_sum and max_sum as you iterate.",
      validator: (code: string) => /max|current|kadane|subarray/i.test(code) && code.includes('for')
    },
    {
      title: 'challenge_03.py', track: 'Coding', difficulty: 'Hard',
      timeLimit: '30 min', solvedCount: 89, successRate: 41, points: 200,
      problem: 'Given coin denominations, return the minimum coins to make a target.\nExample: coinChange([1,5,10,25], 36) → 3 (25+10+1)',
      hint: 'Use dynamic programming (bottom-up). Build table dp[0..amount].',
      validator: (code: string) => /dp|dynamic|memo|min/i.test(code) && code.includes('for')
    }
  ];
  currentChallengeIndex = 0;
  get currentChallenge() { return this.challenges[this.currentChallengeIndex]; }
  typedProblem = '';
  userCode = '';
  codeLineNumbers = [1, 2, 3, 4, 5, 6];
  challengeResult: boolean | null = null;
  challengeResultMessage = '';
  isChallengeRunning = false;
  hintVisible = false;
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

  trendingSearches = [
    'PRESEC Legon',
    'Robotics Rules 2026',
    'LMS Assignments',
    'Registration Form',
    'Sponsor List',
    'CTF Challenge'
  ];

  filteredSearchResults: string[] = [];

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
    public contentService: ContentService
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

  toggleSearch(open: boolean): void {
    this.isSearchOpen = open;
    if (open) {
      this.searchQuery = '';
      this.filteredSearchResults = [];
      document.body.style.overflow = 'hidden'; // Lock background scroll
    } else {
      document.body.style.overflow = ''; // Restore scroll
    }
  }

  onSearchInput(): void {
    if (!this.searchQuery.trim()) {
      this.filteredSearchResults = [];
      return;
    }
    const q = this.searchQuery.toLowerCase();
    this.filteredSearchResults = this.trendingSearches.filter(s => 
      s.toLowerCase().includes(q)
    );
  }

  selectTrending(term: string): void {
    this.searchQuery = term;
    this.onSearchInput();
  }

  detectRoleFromInput(credential: string): void {
    if (!credential.trim()) {
      this.detectedRoleName = '';
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
      this.detectedRoleName = labels[user.role] || 'User';
    } else if (lookup === 'admin@ntic.org.gh') {
      this.detectedRoleName = 'Administrator';
    } else {
      this.detectedRoleName = '';
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
        super_admin: '/dashboard'
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
      const cards = this.elementRef.nativeElement.querySelectorAll('.gateway-card-inner, .login-modal-card, .academic-login-card, .why-exist-card, .support-card, .spotlight-card, .philosophy-card, .alumni-card, .hero-text-card, .scoreboard-table-card, .challenge-editor-card');
      cards.forEach((card: HTMLElement) => {
        const isLoginCard = card.classList.contains('academic-login-card') || card.classList.contains('gateway-card-inner') || card.classList.contains('login-modal-card');
        let rAFId: number | null = null;
        
        const mouseMoveHandler = (event: MouseEvent) => {
          if (rAFId) {
            cancelAnimationFrame(rAFId);
          }
          
          rAFId = requestAnimationFrame(() => {
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const multiplier = isLoginCard ? -4 : -8;
            const rx = ((y - cy) / cy) * multiplier;
            const ry = ((x - cx) / cx) * Math.abs(multiplier);
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
            
            if (isLoginCard) {
              card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(0, -6px, 15px)`;
            } else {
              card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-12px) scale(1.018)`;
            }
            card.style.transition = 'transform 0.08s linear, box-shadow 0.5s ease, border-color 0.5s ease';
          });
        };

        const mouseLeaveHandler = () => {
          if (rAFId) {
            cancelAnimationFrame(rAFId);
          }
          card.style.transition = 'transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s ease, border-color 0.5s ease';
          card.style.transform = '';
        };

        card.addEventListener('mousemove', mouseMoveHandler);
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

    this.ngZone.runOutsideAngular(() => {
      const getDimensions = () => {
        const w = canvas.offsetWidth || canvas.parentElement?.clientWidth || window.innerWidth || 1240;
        const h = canvas.offsetHeight || canvas.parentElement?.clientHeight || 520;
        return { w, h };
      };
      let { w: width, h: height } = getDimensions();
      canvas.width = width; canvas.height = height;

      this.matrixMouseListener = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (mx >= -80 && mx <= rect.width + 80 && my >= -80 && my <= rect.height + 80) {
          this.stripeTargetMouseX = mx; this.stripeTargetMouseY = my;
        } else { this.stripeTargetMouseX = -9999; this.stripeTargetMouseY = -9999; }
      };
      window.addEventListener('mousemove', this.matrixMouseListener);
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
        for (let i = 0; i < 80; i++) {
          const t = i / 79;
          const bx = -20 + t * (width + 40) + (Math.random() - 0.5) * 30;
          const ba = -Math.PI / 2 + (t - 0.5) * 0.55 + (Math.random() - 0.5) * 0.15;
          const ml = height * (0.35 + Math.random() * 0.55);
          stalks.push({ bx, by: height + 10, ba, ca: ba, len: Math.random() * ml, ml,
            spd: 0.4 + Math.random() * 0.6, lw: 0.5 + Math.random() * 0.9,
            dr: 1.5 + Math.random() * 3, a: 0.3 + Math.random() * 0.6,
            ss: 0.012 + Math.random() * 0.02, sp: Math.random() * Math.PI * 2,
            sa: 0.03 + Math.random() * 0.05, ci: i % 5,
            cv: (Math.random() - 0.5) * 35 });
        }
      };
      initStalks();

      // ── FISHES (8) ─────────────────────────────────────────
      interface Fish { x: number; y: number; vx: number; vy: number; s: number; c: string; g: string; tp: number; sp: number; }
      const fishes: Fish[] = [];
      const fp = [
        { b: '#00f2fe', g: 'rgba(0,242,254,0.5)' }, { b: '#ff007f', g: 'rgba(255,0,127,0.5)' },
        { b: '#ffd700', g: 'rgba(255,215,0,0.4)' }, { b: '#c084fc', g: 'rgba(192,132,252,0.4)' },
        { b: '#34d399', g: 'rgba(52,211,153,0.4)' },
      ];
      const initFishes = () => {
        fishes.length = 0;
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 0.5 + Math.random() * 0.8;
          const p = fp[i % fp.length];
          fishes.push({ x: Math.random() * width, y: height * 0.15 + Math.random() * height * 0.6,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.3,
            s: 3 + Math.random() * 3.5, c: p.b, g: p.g, tp: Math.random() * Math.PI * 2, sp });
        }
      };
      initFishes();

      // ── BUBBLES (15) ───────────────────────────────────────
      interface Bub { x: number; y: number; r: number; vy: number; a: number; p: number; }
      const bubs: Bub[] = [];
      const initBubs = () => {
        bubs.length = 0;
        for (let i = 0; i < 15; i++) {
          bubs.push({ x: Math.random() * width, y: Math.random() * height,
            r: 1 + Math.random() * 2.5, vy: -(0.15 + Math.random() * 0.35),
            a: 0.15 + Math.random() * 0.4, p: Math.random() * Math.PI * 2 });
        }
      };
      initBubs();

      this.matrixResizeListener = () => {
        const { w, h } = getDimensions();
        width = canvas.width = w; height = canvas.height = h;
        initStalks(); initFishes(); initBubs();
      };
      window.addEventListener('resize', this.matrixResizeListener);

      let frame = 0;
      const nc = ['255, 0, 127', '0, 242, 254', '255, 123, 0', '52, 211, 153', '192, 132, 252'];

      const draw = () => {
        if (canvas.width !== width || canvas.height !== height) {
          const { w, h } = getDimensions();
          width = canvas.width = w; height = canvas.height = h;
          initStalks(); initFishes(); initBubs();
        }
        if (!width || !height) { this.matrixAnimFrame = requestAnimationFrame(draw); return; }
        frame++;

        if (this.stripeTargetMouseX !== -9999) {
          if (this.stripeMouseX === -9999) { this.stripeMouseX = this.stripeTargetMouseX; this.stripeMouseY = this.stripeTargetMouseY; }
          else { this.stripeMouseX += (this.stripeTargetMouseX - this.stripeMouseX) * 0.1; this.stripeMouseY += (this.stripeTargetMouseY - this.stripeMouseY) * 0.1; }
        } else { this.stripeMouseX = -9999; this.stripeMouseY = -9999; }

        ctx.clearRect(0, 0, width, height);

        // Bottom glow
        const bg = ctx.createRadialGradient(width / 2, height, 0, width / 2, height, width * 0.55);
        bg.addColorStop(0, 'rgba(120, 80, 255, 0.16)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);

        // Mouse aurora
        if (this.stripeMouseX !== -9999) {
          const mg = ctx.createRadialGradient(this.stripeMouseX, this.stripeMouseY, 0, this.stripeMouseX, this.stripeMouseY, 220);
          mg.addColorStop(0, 'rgba(0,242,254,0.2)'); mg.addColorStop(0.4, 'rgba(192,132,252,0.1)');
          mg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = mg; ctx.beginPath();
          ctx.arc(this.stripeMouseX, this.stripeMouseY, 220, 0, Math.PI * 2); ctx.fill();
        }

        // Bubbles (no shadow — lightweight)
        bubs.forEach(b => {
          b.y += b.vy; b.x += Math.sin(frame * 0.025 + b.p) * 0.3;
          if (b.y < -10) { b.y = height + 10; b.x = Math.random() * width; }
          ctx.fillStyle = `rgba(180,200,255,${b.a * (0.6 + 0.4 * Math.sin(frame * 0.04 + b.p))})`;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        });

        // Stalks (bezier, no shadow per stalk — use gradient only)
        stalks.forEach(st => {
          st.len += st.spd;
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
          st.ca += (st.ba + sway + ms - st.ca) * 0.08;
          const tipX = st.bx + Math.cos(st.ca) * st.len;
          const tipY = st.by + Math.sin(st.ca) * st.len;
          const midX = (st.bx + tipX) / 2 + st.cv * Math.sin(frame * st.ss * 0.5 + st.sp);
          const midY = (st.by + tipY) / 2 + st.cv * 0.5;
          const p = 0.7 + 0.3 * Math.sin(frame * 0.03 + st.sp);
          const al = st.a * p * Math.min(1, st.len / 80);
          if (al <= 0.01) return;
          const near = mp > 0.05;
          const col = near ? nc[st.ci] : '200,200,255';
          const lg = ctx.createLinearGradient(st.bx, st.by, tipX, tipY);
          lg.addColorStop(0, 'rgba(80,60,180,0)');
          lg.addColorStop(0.3, `rgba(140,120,220,${al * 0.3})`);
          lg.addColorStop(1, `rgba(${col},${al * (near ? 1 : 0.85)})`);
          ctx.beginPath(); ctx.moveTo(st.bx, st.by);
          ctx.quadraticCurveTo(midX, midY, tipX, tipY);
          ctx.strokeStyle = lg; ctx.lineWidth = st.lw * (near ? 1.4 : 1); ctx.stroke();
          // Tip dot (no shadow)
          ctx.fillStyle = `rgba(${col},${al})`;
          ctx.beginPath(); ctx.arc(tipX, tipY, st.dr * (near ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
        });

        // Fishes (simplified — no shadowBlur per frame)
        fishes.forEach(f => {
          f.x += f.vx; f.y += f.vy + Math.sin(frame * 0.05 + f.tp) * 0.2;
          if (f.x < -35) f.x = width + 35; if (f.x > width + 35) f.x = -35;
          if (f.y < 25) f.vy = Math.abs(f.vy); if (f.y > height - 45) f.vy = -Math.abs(f.vy);
          if (this.stripeMouseX !== -9999) {
            const dx = f.x - this.stripeMouseX, dy = f.y - this.stripeMouseY;
            const d = Math.hypot(dx, dy);
            if (d < 140 && d > 10) { f.vx += (dx / d) * 0.1; f.vy += (dy / d) * 0.06; }
          }
          const spd = Math.hypot(f.vx, f.vy);
          if (spd > f.sp * 2) { f.vx = f.vx / spd * f.sp * 2; f.vy = f.vy / spd * f.sp * 2; }
          f.vx *= 0.999; f.vy *= 0.999;
          const s = f.s;
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

        this.matrixAnimFrame = requestAnimationFrame(draw);
      };
      draw();
    });
  }

  restartMatrixRain(): void {
    if (this.matrixAnimFrame) return;
    this.startMatrixRain();
  }

  // ── FLOATING FAB ────────────────────────────────────────────
  setupFabScroll(): void {
    if (typeof window === 'undefined') return;
    this.fabScrollListener = () => {
      this.ngZone.run(() => { this.fabVisible = window.scrollY > 400; });
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

    triggerArenaAction(track: string, actionType: string): void {
    const state = this.arenaState[track];
    if (!state) return;

    if (track === 'robotics') {
      if (actionType === 'forward') {
        state.posY = Math.max(15, (state.posY || 50) - 12);
        state.motorSpeed = 95;
        state.angle = 90;
        state.distance = Math.floor(Math.random() * 25) + 35;
        state.status = '🟢 ROVER DRIVING FORWARD • 1.4 M/S';
        state.statusColor = '#00e676';
        state.log = `Drive motors engaged at 95% RPM. Rover advanced to grid coordinates (${state.posX}%, ${state.posY}%).`;
      } else if (actionType === 'reverse') {
        state.posY = Math.min(80, (state.posY || 50) + 12);
        state.motorSpeed = 60;
        state.angle = 90;
        state.distance = Math.floor(Math.random() * 20) + 40;
        state.status = '🔵 REVERSING ROVER • BACKUP RADAR ON';
        state.statusColor = '#38bdf8';
        state.log = `Reverse gear engaged. Backing up to coordinates (${state.posX}%, ${state.posY}%). Rear sonar clear.`;
      } else if (actionType === 'left') {
        state.posX = Math.max(15, (state.posX || 50) - 12);
        state.angle = 45;
        state.motorSpeed = 75;
        state.status = '↩️ STEERING LEFT 45° • DIFFERENTIAL DRIVE';
        state.statusColor = '#0088cc';
        state.log = `Differential steering turned left 45°. Rover shifted left to (${state.posX}%, ${state.posY}%).`;
      } else if (actionType === 'right') {
        state.posX = Math.min(85, (state.posX || 50) + 12);
        state.angle = 135;
        state.motorSpeed = 75;
        state.status = '↪️ STEERING RIGHT 135° • DIFFERENTIAL DRIVE';
        state.statusColor = '#0088cc';
        state.log = `Differential steering turned right 135°. Rover shifted right to (${state.posX}%, ${state.posY}%).`;
      } else if (actionType === 'stop') {
        state.motorSpeed = 0;
        state.status = '🛑 ROVER HALTED • STANDBY & MONITORING';
        state.statusColor = '#ffea00';
        state.log = 'Emergency brakes applied. Rover stationary at current coordinates. Ultrasonic radar monitoring perimeter.';
      } else if (actionType === 'claw') {
        state.clawOpen = !state.clawOpen;
        if (state.clawOpen) {
          state.cargo = 'Titanium Ore Sample';
          state.status = '🦾 ROBOTIC CLAW DEPLOYED • SAMPLE SECURED';
          state.statusColor = '#00e676';
          state.log = 'Robotic manipulator arm extended 35cm. Sample grabbed and stored in cargo bay.';
        } else {
          state.cargo = 'None';
          state.status = '🦾 CLAW RETRACTED • CARGO DEPOSITED';
          state.statusColor = '#38bdf8';
          state.log = 'Robotic arm retracted. Mineral sample deposited into on-board spectroscopy analysis chamber.';
        }
      } else if (actionType === 'obstacle') {
        state.distance = Math.floor(Math.random() * 8) + 8; // 8-15cm
        state.angle = 135;
        state.motorSpeed = 40;
        state.status = '⚠️ OBSTACLE DETECTED • EVASIVE MANEUVER';
        state.statusColor = '#ff1744';
        state.log = `Obstacle rock detected at ${state.distance}cm! Spinning servo right 135° to evade.`;
      } else if (actionType === 'calibrate') {
        state.distance = 50;
        state.angle = 90;
        state.motorSpeed = 90;
        state.status = '⚡ SENSORS CALIBRATED • PATH CLEAR';
        state.statusColor = '#00e676';
        state.log = '360° LIDAR & Ultrasonic sensors calibrated. Zero bias error. Proceeding at full speed.';
      }
    } else if (track === 'coding') {
      if (actionType === 'bubble') {
        state.bars = [20, 30, 40, 50, 60, 70, 80, 90, 95, 100, 100, 100];
        state.benchmarkMs = '0.12';
        state.opsSec = '3.8M ops/s';
        state.status = '⚡ QUICKSORT CONVERGED IN 0.12ms';
        state.statusColor = '#00e676';
        state.log = 'QuickSort partitioned array in-place. O(N log N) optimal time complexity achieved.';
      } else if (actionType === 'reverse') {
        state.bars = (state.bars || [35, 60, 25, 85, 45, 95, 50, 75, 30, 90, 65, 80]).slice().reverse();
        state.status = '💥 DATA STREAM INVERTED';
        state.statusColor = '#ffea00';
        state.log = 'Inverted memory buffer order. Data stream reversed across 12 registers.';
      } else if (actionType === 'randomize') {
        state.bars = Array.from({ length: 12 }, () => Math.floor(Math.random() * 75) + 25);
        state.status = '🎲 ARRAY SHUFFLED • READY TO SORT';
        state.statusColor = '#0088cc';
        state.log = 'Shuffled 12 array bars with random heights. Awaiting sorting algorithm execution.';
      } else if (actionType === 'stress') {
        state.benchmarkMs = (Math.random() * 0.15 + 0.25).toFixed(2);
        state.opsSec = (Math.random() * 0.8 + 3.2).toFixed(1) + 'M ops/s';
        state.status = '🔥 10,000 ITERATION STRESS TEST PASSED';
        state.statusColor = '#00e676';
        state.log = `Executed 10,000 recursive DP cases in ${state.benchmarkMs}ms with zero memory leaks.`;
      } else if (actionType === 'optimize') {
        state.memory = (Math.random() * 1.5 + 9.5).toFixed(1) + ' MB';
        state.status = '✨ GARBAGE COLLECTION & CACHE OPTIMIZED';
        state.statusColor = '#0088cc';
        state.log = `Reduced heap footprint to ${state.memory}. L1 cache hit rate reached 99.7%.`;
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
        const samples = ['sample_cocoa', 'sample_maize', 'sample_potato', 'sample_tomato'];
        const randomSample = samples[Math.floor(Math.random() * samples.length)];
        this.triggerArenaAction('ai', randomSample);
      } else if (actionType === 'epoch') {
        state.epoch = Math.min(50, state.epoch + 1);
        state.loss = (parseFloat(state.loss || '0.0123') * 0.92).toFixed(4);
        state.status = `🚀 TRAINING EPOCH ${state.epoch}/50 COMPLETED`;
        state.statusColor = '#ab47bc';
        state.log = `Backpropagation step finished. Validation loss dropped to ${state.loss}. Synapse weights updated.`;
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
        state.solarKw = (Math.random() * 8 + 52.0).toFixed(1);
        state.battery = Math.min(100, state.battery + 4);
        state.status = '☀️ SOLAR TRACKING TILTED +15° • PEAK GENERATION';
        state.statusColor = '#00e676';
        state.log = `Solar panels tilted +15° toward sun. Array output surged to ${state.solarKw} kW. Battery storage at ${state.battery}%.`;
      } else if (actionType === 'wind') {
        state.windKw = (Math.random() * 5 + 18.5).toFixed(1);
        state.status = '💨 TURBINE PITCH ANGLE BOOSTED';
        state.statusColor = '#38bdf8';
        state.log = `Wind turbine blade pitch angle optimized for 14m/s wind speed. Generating ${state.windKw} kW clean power.`;
      } else if (actionType === 'hospital') {
        state.hospitalPower = 'Emergency Ward Boosted (120%)';
        state.status = '🏥 PRIORITY CLEAN POWER DIRECTED TO HOSPITAL';
        state.statusColor = '#00e676';
        state.log = 'Municipal smart grid redirected 25 kW backup solar battery storage to ICU and Emergency ward life-support systems.';
      } else if (actionType === 'sync') {
        state.co2Saved += Math.floor(Math.random() * 60) + 30;
        state.efficiency = '99.4%';
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
    this.currentChallengeIndex = (this.currentChallengeIndex + 1) % this.challenges.length;
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
      if (!passed) {
        this.challengeResultMessage = 'Not quite right. Check your logic or use the hint!';
      }
    }, 900);
  }

  showHint(): void {
    this.hintVisible = !this.hintVisible;
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
