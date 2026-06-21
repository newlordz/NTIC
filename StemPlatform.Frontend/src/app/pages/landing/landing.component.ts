import { Component, OnInit, AfterViewInit, OnDestroy, NgZone, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private cardListeners: { card: HTMLElement; mouseMove: any; mouseLeave: any }[] = [];
  roles: UserRole[] = [
    {
      id: 'student',
      name: 'Student Portal',
      icon: 'school',
      description: 'Access courses, submit assignments, and compete in active tracks.',
      defaultEmail: 'kwame.asante@student.ntic.gov.gh'
    },
    {
      id: 'instructor',
      name: 'Instructor Portal',
      icon: 'patient_list',
      description: 'Manage teams, assess submissions, and mentor student projects.',
      defaultEmail: 'efua.mensah@instructor.ntic.gov.gh'
    },
    {
      id: 'school_admin',
      name: 'School Admin Portal',
      icon: 'domain',
      description: 'Register your school, manage teams, and view institutional analytics.',
      defaultEmail: 'headmaster@presec.edu.gh'
    },
    {
      id: 'judge',
      name: 'Judge Portal',
      icon: 'gavel',
      description: 'Evaluate projects, score competition rounds, and publish rankings.',
      defaultEmail: 'evaluator.osei@judge.ntic.gov.gh'
    },
    {
      id: 'sponsor',
      name: 'Sponsor Portal',
      icon: 'handshake',
      description: 'Track corporate impact, monitor CSR statistics, and follow talent.',
      defaultEmail: 'sponsorship@tullowghana.com'
    },
    {
      id: 'super_admin',
      name: 'Super Admin',
      icon: 'shield_person',
      description: 'Configure system settings, monitor portal activity, and access audits.',
      defaultEmail: 'admin@ntic.gov.gh'
    }
  ];

  activeRoleId = 'student';
  email = '';
  password = '••••••••••••';
  isLoggingIn = false;

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
      image: 'assets/stem_image_8.jpeg',
      video: 'assets/stem_slideshow.mp4',
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

  leaderboardData: LeaderboardEntry[] = [
    {
      rank: '01',
      schoolName: "Presbyterian Boys' Sec. School (PRESEC)",
      location: 'Legon, Greater Accra Region',
      points: 490,
      trackPoints: { all: 490, coding: 130, robotics: 120, ai: 110, cyber: 130 },
      region: 'Accra'
    },
    {
      rank: '02',
      schoolName: 'Achimota School',
      location: 'Achimota, Greater Accra Region',
      points: 465,
      trackPoints: { all: 465, coding: 100, robotics: 140, ai: 115, cyber: 110 },
      region: 'Accra'
    },
    {
      rank: '03',
      schoolName: 'Prempeh College',
      location: 'Kumasi, Ashanti Region',
      points: 450,
      trackPoints: { all: 450, coding: 110, robotics: 110, ai: 120, cyber: 110 },
      region: 'Ashanti'
    },
    {
      rank: '04',
      schoolName: "Wesley Girls' High School",
      location: 'Cape Coast, Central Region',
      points: 435,
      trackPoints: { all: 435, coding: 120, robotics: 90, ai: 105, cyber: 120 },
      region: 'Central'
    }
  ];

  get filteredLeaderboard(): any[] {
    const filter = this.activeLeaderboardFilter;
    const sorted = [...this.leaderboardData].map(entry => {
      let pts = entry.points;
      if (filter === 'coding') pts = entry.trackPoints.coding;
      else if (filter === 'robotics') pts = entry.trackPoints.robotics;
      else if (filter === 'ai') pts = entry.trackPoints.ai;
      else if (filter === 'cyber') pts = entry.trackPoints.cyber;
      return { ...entry, displayPoints: pts };
    });
    
    // Sort in descending order of displayPoints
    sorted.sort((a, b) => b.displayPoints - a.displayPoints);
    
    // Recalculate dynamic rank indices
    return sorted.map((entry, index) => {
      const rankNum = index + 1;
      return {
        ...entry,
        displayRank: rankNum < 10 ? '0' + rankNum : '' + rankNum
      };
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
    private elementRef: ElementRef
  ) {
    this.selectRole('student');
    // Populate videoEditImages with all 48 photos in a shuffled order for organic variation
    const firstSlide = this.slides[0];
    if (firstSlide && firstSlide.isVideoEdit) {
      const paths = [];
      for (let i = 1; i <= 48; i++) {
        paths.push(`assets/stem_image_${i}.jpeg`);
      }
      paths.sort(() => Math.random() - 0.5);
      firstSlide.videoEditImages = paths;
    }
  }

  ngOnInit(): void {
    this.startSlideShow();
    this.setupIntersectionObserver();
    this.setupSpotlightObserver();
    this.setupTracksObserver();
    this.setupScoreboardObserver();
    this.setupStatsObserver();
    this.setupConceptObserver();
    this.setupSupportObserver();
    this.preloadNextImages(0, 3);
  }

  ngAfterViewInit(): void {
    this.setupCardParallax();
  }

  ngOnDestroy(): void {
    this.stopSlideShow();
    this.stopVideoEditLoop();
    if (this.decryptInterval) {
      clearInterval(this.decryptInterval);
    }
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
    }
    this.telemetryTimeouts.forEach(t => clearTimeout(t));
    this.telemetryTimeouts = [];
    
    if (this.heroObserver) {
      this.heroObserver.disconnect();
    }
    if (this.spotlightObserver) {
      this.spotlightObserver.disconnect();
    }
    if (this.tracksObserver) {
      this.tracksObserver.disconnect();
    }
    if (this.scoreboardObserver) {
      this.scoreboardObserver.disconnect();
    }
    if (this.statsObserver) {
      this.statsObserver.disconnect();
    }
    if (this.conceptObserver) {
      this.conceptObserver.disconnect();
    }
    if (this.supportObserver) {
      this.supportObserver.disconnect();
    }
    // Clean up card parallax listeners
    this.cardListeners.forEach(item => {
      item.card.removeEventListener('mousemove', item.mouseMove);
      item.card.removeEventListener('mouseleave', item.mouseLeave);
    });
    this.cardListeners = [];
  }

  private preloadNextImages(currentIndex: number, count: number = 3): void {
    const currentSlide = this.slides[0];
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
    
    if (this.slides.length > 1) {
      const duration = currentSlide.isVideoEdit ? 8000 : 6000;
      this.ngZone.runOutsideAngular(() => {
        this.slideInterval = setInterval(() => {
          this.ngZone.run(() => {
            this.nextSlide();
          });
        }, duration);
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
    const currentSlide = this.slides[0];

    if (currentSlide && currentSlide.videoEditImages && currentSlide.videoEditImages.length > 0) {
      this.image1Url = currentSlide.videoEditImages[0];
      this.image2Url = currentSlide.videoEditImages[0];
      this.activeFrame = 1;
    }

    const imgCount = currentSlide.videoEditImages ? currentSlide.videoEditImages.length : 1;
    const images = currentSlide.videoEditImages || [];

    this.ngZone.runOutsideAngular(() => {
      const container = this.elementRef.nativeElement.querySelector('.video-edit-container');

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
      }, 5000);
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

  selectRole(roleId: string, animate: boolean = false): void {
    if (this.activeRoleId === roleId && this.email && animate) return;
    this.activeRoleId = roleId;
    const role = this.roles.find(r => r.id === roleId);
    if (role) {
      if (animate && typeof window !== 'undefined') {
        this.triggerBiometricScan();
        this.decryptEmail(role.defaultEmail);
        this.updateTelemetry(role.name);
      } else {
        this.email = role.defaultEmail;
        this.password = 'password123';
        this.telemetryLogs = [
          `SECURE ACCESS PORTAL READY`,
          `SYSTEM INTEGRITY: ACCREDITED`,
          `AWAITING OPERATOR INPUT...`
        ];
      }
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
    const emailInput = this.elementRef.nativeElement.querySelector('#email') as HTMLInputElement;
    
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

  get activeRole(): UserRole {
    return this.roles.find(r => r.id === this.activeRoleId) || this.roles[0];
  }

  login(): void {
    this.isLoggingIn = true;
    setTimeout(() => {
      this.isLoggingIn = false;
      localStorage.setItem('activeRoleId', this.activeRoleId);
      this.router.navigate(['/dashboard']);
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

        const r = Math.floor(ease * 16);
        const m = Math.floor(ease * 800);
        const s = Math.floor(ease * 180);
        const st = Math.floor(ease * 12);
        const p = (ease * 1.5).toFixed(1);
        const g = Math.floor(ease * 2);

        if (regionsEl) regionsEl.textContent = `${r}`;
        if (mentorsEl) mentorsEl.textContent = `${m}+`;
        if (schoolsEl) schoolsEl.textContent = `${s}+`;
        if (studentsEl) studentsEl.textContent = `${st}K+`;
        if (projectsEl) projectsEl.textContent = `${p}K+`;
        if (grantsEl) grantsEl.textContent = `₵${g}M+`;

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          if (regionsEl) regionsEl.textContent = `16`;
          if (mentorsEl) mentorsEl.textContent = `800+`;
          if (schoolsEl) schoolsEl.textContent = `180+`;
          if (studentsEl) studentsEl.textContent = `12K+`;
          if (projectsEl) projectsEl.textContent = `1.5K+`;
          if (grantsEl) grantsEl.textContent = `₵2M+`;
          
          this.ngZone.run(() => {
            this.regionsCount = 16;
            this.mentorsCount = 800;
            this.schoolsCount = 180;
            this.studentsCount = 12;
            this.projectsCount = 1.5;
            this.grantsCount = 2;
          });
        }
      };

      requestAnimationFrame(step);
    });
  }

  private setupCardParallax(): void {
    if (typeof window === 'undefined') return;
    this.ngZone.runOutsideAngular(() => {
      const cards = this.elementRef.nativeElement.querySelectorAll('.spotlight-card, .academic-login-card, .why-exist-card, .support-card');
      cards.forEach((card: HTMLElement) => {
        const isLoginCard = card.classList.contains('academic-login-card');
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
            
            if (isLoginCard) {
              card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(0, -6px, 15px)`;
            } else {
              card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-12px) scale(1.018)`;
            }
            card.style.transition = 'transform 0.08s linear, box-shadow 0.35s ease, border-color 0.35s';
          });
        };

        const mouseLeaveHandler = () => {
          if (rAFId) {
            cancelAnimationFrame(rAFId);
          }
          card.style.transition = 'transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease, border-color 0.35s, opacity 0.7s ease';
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
}
