import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss'
})
export class RegistrationComponent implements OnInit, OnDestroy {
  regState = 'gateway'; // 'gateway', 'new', 'continue_select', 'otp_verification', 'resume_success'
  activeTab = 'school';
  studentRegMode = 'single';
  selectedTrack = 'robotics';

  verificationMethod = 'email'; // 'email' | 'mobile'
  verificationInput = '';
  otpCode = '';
  otpError = '';
  resendTimer = 0;
  resendInterval: any;
  showTestCodeTip = false;

  // Prefilled mock draft data to populate on successful resume
  mockDraftData = {
    schoolName: 'Prempeh College (Draft Resume)',
    category: 'Public High School',
    region: 'Ashanti',
    district: 'Kumasi Metropolitan',
    tel: '+233 24 412 3456',
    email: 'prempeh.draft@edu.gh',
    gps: '6.6666° N, 1.6163° W'
  };

  schoolForm = {
    name: '',
    category: 'Public High School',
    region: 'Greater Accra',
    district: '',
    tel: '',
    email: '',
    gps: ''
  };

  tracks = [
    { id: 'coding', label: 'Coding', icon: 'code' },
    { id: 'robotics', label: 'Robotics', icon: 'smart_toy' },
    { id: 'ai', label: 'AI', icon: 'psychology' },
    { id: 'cyber', label: 'Cybersecurity', icon: 'security' },
    { id: 'innovation', label: 'Innovation', icon: 'tips_and_updates' },
  ];

  recentStudents = [
    { name: 'Kwame Asante', id: 'STU-0012', school: 'Achimota', track: 'coding', date: '2026-06-18' },
    { name: 'Abena Mensah', id: 'STU-0013', school: 'Wesley Girls', track: 'robotics', date: '2026-06-18' },
    { name: 'Kofi Boateng', id: 'STU-0014', school: 'Prempeh', track: 'cyber', date: '2026-06-17' },
    { name: 'Ama Darko', id: 'STU-0015', school: 'Holy Child', track: 'innovation', date: '2026-06-17' },
    { name: 'Yaw Mensah', id: 'STU-0016', school: 'PRESEC', track: 'ai', date: '2026-06-16' },
  ];

  sponsors = [
    { name: 'Tullow Ghana', tier: 'Platinum', support: 'Coding & AI', amount: '₵ 120,000', status: 'Confirmed' },
    { name: 'MTN Ghana Foundation', tier: 'Platinum', support: 'Robotics & Cyber', amount: '₵ 80,000', status: 'Confirmed' },
    { name: 'GCB Bank PLC', tier: 'Gold', support: 'Innovation Arena', amount: '₵ 40,000', status: 'Confirmed' },
  ];

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['track']) {
        this.selectedTrack = params['track'];
        this.activeTab = 'student';
        this.regState = 'new'; // Bypass gateway for specific track clicks
      } else {
        this.regState = 'gateway';
      }
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  selectNewRegistration(): void {
    this.regState = 'new';
    this.clearDraftPrefills();
  }

  selectContinueRegistration(): void {
    this.regState = 'continue_select';
    this.verificationInput = '';
    this.otpCode = '';
    this.otpError = '';
  }

  goBackToGateway(): void {
    this.regState = 'gateway';
    this.clearTimer();
  }

  setVerificationMethod(method: 'email' | 'mobile'): void {
    this.verificationMethod = method;
    this.verificationInput = '';
    this.otpError = '';
  }

  sendOTP(): void {
    if (!this.verificationInput) {
      this.otpError = this.verificationMethod === 'email' 
        ? 'Please enter your registered email address.' 
        : 'Please enter your registered mobile number.';
      return;
    }
    
    if (this.verificationMethod === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.verificationInput)) {
        this.otpError = 'Please enter a valid email address.';
        return;
      }
    } else {
      const phoneRegex = /^\+?[0-9]{8,15}$/;
      if (!phoneRegex.test(this.verificationInput.replace(/\s+/g, ''))) {
        this.otpError = 'Please enter a valid mobile number.';
        return;
      }
    }

    this.otpError = '';
    this.otpCode = '';
    this.regState = 'otp_verification';
    this.startResendTimer();
    this.showTestCodeTip = true;
  }

  startResendTimer(): void {
    this.resendTimer = 60;
    this.clearTimer();
    this.resendInterval = setInterval(() => {
      if (this.resendTimer > 0) {
        this.resendTimer--;
      } else {
        this.clearTimer();
      }
    }, 1000);
  }

  resendOTPCode(): void {
    this.otpCode = '';
    this.otpError = '';
    this.startResendTimer();
  }

  verifyOTP(): void {
    if (this.otpCode.length !== 6) {
      this.otpError = 'Please enter the complete 6-digit code.';
      return;
    }

    if (this.otpCode === '123456') {
      this.otpError = '';
      this.regState = 'resume_success';
      this.clearTimer();
      
      // Auto-transition to form with prefilled draft data after 2 seconds
      setTimeout(() => {
        this.applyDraftPrefills();
        this.regState = 'new';
      }, 2200);
    } else {
      this.otpError = 'Invalid code. Use 123456 to test the flow successfully.';
    }
  }

  detectGps(): void {
    this.schoolForm.gps = '5.6037° N, 0.1870° W';
  }

  private clearTimer(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  private clearDraftPrefills(): void {
    this.schoolForm = {
      name: '',
      category: 'Public High School',
      region: 'Greater Accra',
      district: '',
      tel: '',
      email: '',
      gps: ''
    };
  }

  private applyDraftPrefills(): void {
    this.schoolForm.name = this.mockDraftData.schoolName;
    this.schoolForm.category = this.mockDraftData.category;
    this.schoolForm.region = this.mockDraftData.region;
    this.schoolForm.district = this.mockDraftData.district;
    this.schoolForm.tel = this.mockDraftData.tel;
    this.schoolForm.email = this.mockDraftData.email;
    this.schoolForm.gps = this.mockDraftData.gps;
    this.activeTab = 'school';
  }
}
