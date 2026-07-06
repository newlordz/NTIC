import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

export interface InstructorSubmission {
  id: string;
  student: string;
  avatar: string;
  school: string;
  assignment: string;
  track: string;
  file: string;
  status: 'pending' | 'approved' | 'resubmission';
  time: string;
  codeSnippet: string;
  priority: 'high' | 'normal';
}

export interface InstructorCourse {
  title: string;
  track: string;
  icon: string;
  level: string;
  enrolled: number;
  completion: number;
  modules: number;
  pendingReviews: number;
}

@Component({
  selector: 'app-instructor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructor.component.html',
  styleUrl: './instructor.component.scss',
  animations: [
    trigger('tabFade', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ]),
    trigger('panelSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(24px)' }),
        animate('500ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
      ])
    ]),
    trigger('listStagger', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateX(-12px)' }),
          stagger(60, [
            animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('toastPop', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px) scale(0.95)' }),
        animate('400ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('250ms ease-in', style({ opacity: 0, transform: 'translateY(-10px) scale(0.98)' }))
      ])
    ])
  ]
})
export class InstructorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('heroCanvas') heroCanvas?: ElementRef<HTMLCanvasElement>;

  activeTab: 'grading' | 'courses' | 'mentorship' = 'grading';
  selectedSubmission: InstructorSubmission | null = null;
  reviewScore = 0;
  reviewFeedback = '';
  showSuccessToast = false;
  toastMessage = '';
  trackFilter = 'all';
  mouseX = 0;
  mouseY = 0;

  animatedStats = { pending: 0, reviewed: 0, students: 0, courses: 0 };
  private statTargets = { pending: 42, reviewed: 318, students: 1240, courses: 9 };
  private animFrame?: number;
  private canvasAnim?: number;
  private toastTimer?: ReturnType<typeof setTimeout>;

  tabs = [
    { id: 'grading' as const, label: 'Grading Queue', icon: 'assignment_turned_in', badge: 42 },
    { id: 'courses' as const, label: 'My Courses', icon: 'library_books', badge: 0 },
    { id: 'mentorship' as const, label: 'Team Mentorship', icon: 'groups', badge: 6 }
  ];

  submissions: InstructorSubmission[] = [
    {
      id: 'sub-001',
      student: 'Kwame Asante',
      avatar: 'KA',
      school: 'Achimota SHS',
      assignment: "Dijkstra's Algorithm Implementation",
      track: 'coding',
      file: 'pathfinder_v2.py',
      status: 'pending',
      time: '10m ago',
      priority: 'high',
      codeSnippet: `def dijkstra(graph, start):
    dist = {node: float('inf') for node in graph}
    dist[start] = 0
    pq = [(0, start)]
    while pq:
        d, u = heappop(pq)
        if d > dist[u]: continue
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heappush(pq, (dist[v], v))
    return dist`
    },
    {
      id: 'sub-002',
      student: 'Abena Mensah',
      avatar: 'AM',
      school: 'Wesley Girls',
      assignment: 'Line Follower Demo',
      track: 'robotics',
      file: 'demo_run.mp4',
      status: 'pending',
      time: '1h ago',
      priority: 'normal',
      codeSnippet: `void loop() {
  int left = analogRead(L_SENSOR);
  int right = analogRead(R_SENSOR);
  if (left > threshold) motorLeft();
  else if (right > threshold) motorRight();
  else motorForward();
}`
    },
    {
      id: 'sub-003',
      student: 'Team Alpha',
      avatar: 'TA',
      school: 'PRESEC Legon',
      assignment: 'Physics Engine Core',
      track: 'coding',
      file: 'src_final_v3.zip',
      status: 'resubmission',
      time: '2h ago',
      priority: 'high',
      codeSnippet: `class RigidBody {
  constructor(mass, pos, vel) {
    this.mass = mass;
    this.position = pos;
    this.velocity = vel;
  }
  applyForce(f) { this.velocity.add(f.div(this.mass)); }
}`
    },
    {
      id: 'sub-004',
      student: 'Kofi Boateng',
      avatar: 'KB',
      school: 'Prempeh College',
      assignment: 'SQL Injection Demo',
      track: 'cyber',
      file: 'writeup.pdf',
      status: 'approved',
      time: '3h ago',
      priority: 'normal',
      codeSnippet: `# CTF Writeup: SQLi bypass via UNION SELECT
# Payload: ' OR 1=1 UNION SELECT username,password FROM users--`
    },
    {
      id: 'sub-005',
      student: 'Ama Darko',
      avatar: 'AD',
      school: 'Holy Child',
      assignment: 'AgriBot Prototype',
      track: 'robotics',
      file: 'bot_demo.mp4',
      status: 'pending',
      time: '4h ago',
      priority: 'normal',
      codeSnippet: `servo.attach(SERVO_PIN);
void harvestLoop() {
  if (soilMoisture < DRY_THRESHOLD) waterPlants();
  if (fruitDetected()) pickFruit();
}`
    }
  ];

  courses: InstructorCourse[] = [
    { title: 'Python Data Structures', track: 'coding', icon: 'data_object', level: 'Intermediate', enrolled: 320, completion: 68, modules: 8, pendingReviews: 12 },
    { title: 'Arduino Robotics Base', track: 'robotics', icon: 'memory', level: 'Beginner', enrolled: 180, completion: 42, modules: 6, pendingReviews: 8 },
    { title: 'Intro to Neural Networks', track: 'ai', icon: 'model_training', level: 'Advanced', enrolled: 85, completion: 15, modules: 7, pendingReviews: 3 },
    { title: 'Ethical Hacking 101', track: 'cyber', icon: 'security', level: 'Intermediate', enrolled: 140, completion: 22, modules: 5, pendingReviews: 6 },
    { title: 'Design Thinking Sprint', track: 'innovation', icon: 'tips_and_updates', level: 'Beginner', enrolled: 210, completion: 55, modules: 4, pendingReviews: 4 },
    { title: 'Web Dev Bootcamp', track: 'coding', icon: 'code', level: 'Beginner', enrolled: 290, completion: 61, modules: 10, pendingReviews: 9 }
  ];

  mentoredTeams = [
    { name: 'PRESEC Robotics A', track: 'robotics', school: 'PRESEC Legon', progress: 78, nextDeadline: 'Jun 28', members: 5, status: 'on-track' },
    { name: 'Achimota Code Squad', track: 'coding', school: 'Achimota SHS', progress: 62, nextDeadline: 'Jul 2', members: 4, status: 'needs-attention' },
    { name: 'Wesley AI Pioneers', track: 'ai', school: 'Wesley Girls', progress: 91, nextDeadline: 'Jun 25', members: 5, status: 'excellent' },
    { name: 'Holy Child Cyber Unit', track: 'cyber', school: 'Holy Child', progress: 45, nextDeadline: 'Jul 5', members: 3, status: 'at-risk' }
  ];

  activityFeed = [
    { icon: 'upload_file', text: 'Kwame Asante submitted pathfinder_v2.py', time: '10m ago', track: 'coding' },
    { icon: 'task_alt', text: 'You approved Kofi Boateng\'s CTF writeup', time: '3h ago', track: 'cyber' },
    { icon: 'forum', text: 'New mentor note on Team Alpha resubmission', time: '2h ago', track: 'coding' },
    { icon: 'school', text: '18 new enrollments in Python Data Structures', time: '5h ago', track: 'coding' }
  ];

  ngOnInit(): void {
    this.animateCounters();
    const firstPending = this.submissions.find(s => s.status === 'pending');
    if (firstPending) this.selectSubmission(firstPending);
  }

  ngAfterViewInit(): void {
    this.initHeroParticles();
  }

  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.canvasAnim) cancelAnimationFrame(this.canvasAnim);
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  get filteredSubmissions(): InstructorSubmission[] {
    if (this.trackFilter === 'all') return this.submissions;
    return this.submissions.filter(s => s.track === this.trackFilter);
  }

  get pendingCount(): number {
    return this.submissions.filter(s => s.status === 'pending').length;
  }

  selectSubmission(sub: InstructorSubmission): void {
    this.selectedSubmission = sub;
    this.reviewScore = sub.status === 'approved' ? 88 : 0;
    this.reviewFeedback = '';
  }

  setTab(tab: 'grading' | 'courses' | 'mentorship'): void {
    this.activeTab = tab;
  }

  setTrackFilter(track: string): void {
    this.trackFilter = track;
  }

  approveSubmission(): void {
    if (!this.selectedSubmission || !this.reviewScore) return;
    this.selectedSubmission.status = 'approved';
    this.showToast(`Approved ${this.selectedSubmission.student} — Score: ${this.reviewScore}/100`);
    this.advanceQueue();
  }

  requestResubmission(): void {
    if (!this.selectedSubmission) return;
    this.selectedSubmission.status = 'resubmission';
    this.showToast(`Resubmission requested for ${this.selectedSubmission.student}`);
    this.advanceQueue();
  }

  private advanceQueue(): void {
    const next = this.submissions.find(s => s.status === 'pending' && s.id !== this.selectedSubmission?.id);
    if (next) this.selectSubmission(next);
  }

  private showToast(message: string): void {
    this.toastMessage = message;
    this.showSuccessToast = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.showSuccessToast = false), 3200);
  }

  private animateCounters(): void {
    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.animatedStats = {
        pending: Math.round(this.statTargets.pending * ease),
        reviewed: Math.round(this.statTargets.reviewed * ease),
        students: Math.round(this.statTargets.students * ease),
        courses: Math.round(this.statTargets.courses * ease)
      };
      if (t < 1) this.animFrame = requestAnimationFrame(tick);
    };
    this.animFrame = requestAnimationFrame(tick);
  }

  private initHeroParticles(): void {
    const canvas = this.heroCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();

    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.2
    }));

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(133, 246, 229, ${p.alpha})`;
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 106, 96, ${0.08 * (1 - dist / 100)})`;
            ctx.stroke();
          }
        }
      }

      this.canvasAnim = requestAnimationFrame(draw);
    };
    draw();
  }

  getScoreRingOffset(): number {
    const circumference = 2 * Math.PI * 54;
    return circumference - (this.reviewScore / 100) * circumference;
  }
}
