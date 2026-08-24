import { getAuthValue, setAuthValue, clearAuthValue, getRememberedCredentials, saveRememberedCredentials, hasRememberedDevice, forgetRememberedCredentials } from '../../services/session.util';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { ThemeService } from '../../services/theme.service';
import { ContentService } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';
import { BrevoEmailService } from '../../services/brevo-email.service';
import { SmsService } from '../../services/sms.service';
import { NotificationService } from '../../services/notification.service';
import { DialogService } from '../../services/dialog.service';
import { ApiService } from '../../services/api.service';
import { OtpService } from '../../services/otp.service';
import { AppSelectComponent } from '../../components/app-select/app-select.component';
import { ForgotPasswordComponent } from '../../components/forgot-password/forgot-password.component';
import { SafePipe } from '../../pipes/safe.pipe';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppSelectComponent, SafePipe, ForgotPasswordComponent],
  templateUrl: './registration.component.html',
  styleUrl: './registration.component.scss'
})
export class RegistrationComponent implements OnInit, OnDestroy {
  readonly ghanaRegions = [
    'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern',
    'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah',
    'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'
  ];

  readonly schoolCategories = [
    'Public High School', 'Private Academy', 'Charter School', 'Technical School'
  ];

  readonly genderOptions = ['Male', 'Female'];
  readonly studentClasses = ['SHS 1', 'SHS 2', 'SHS 3', 'JHS 3', 'Other'];
  readonly instructorQualifications = [
    'B.Ed / BSc Science/Computing', 'Master of Education / MSc', 'PhD', 'Diploma in Education', 'Industry Certified Professional'
  ];
  readonly competitionTracks = [
    'Robotics & AI', 'Coding & App Development', 'Cybersecurity', 'Web & Cloud Development', 'IoT & Embedded Systems'
  ];
  readonly judgeExpertiseOptions = [
    'Robotics & Hardware', 'Software Engineering & AI', 'Cybersecurity & Networks', 'Data Science & Cloud', 'General STEM Education'
  ];
  readonly judgeExperienceOptions = [
    '1-3 Years', '4-7 Years', '8+ Years (Senior Lead)'
  ];
  regState = 'gateway'; // 'gateway', 'new', 'continue_select', 'otp_verification', 'resume_success'
  activeTab: any = 'school';
  isPathModalOpen = false;
  schoolStep = 1; // 1, 2, or 3
  maxSchoolStepReached = 1;
  studentRegMode = 'group';
  selectedTrack = '';
  showAdminPaths = false;

  verificationMethod = 'email'; // 'email' | 'mobile'
  verificationInput = '';
  otpCode = '';
  otpError = '';
  otpBusy = false;
  /** Opaque server handle for the draft-resume challenge. */
  private otpChallengeId = '';
  /** Short-lived proof that the resume code was received; unlocks the draft. */
  private resumeToken = '';
  /** Contact the resume code was actually sent to (the draft owner). */
  private resumeDraftKey = '';
  resendTimer = 0;
  resendInterval: any;
  isDraftResumed = false;

  rightPanelMode = 'preview'; // 'preview' | 'list'

  // Application Tracker
  trackerQuery = '';
  trackerResult: any = null;
  trackerStatus: 'idle' | 'pending' | 'approved' | 'rejected' | 'not_found' = 'idle';
  trackerSearched = false;
  editingApprovalId: string | null = null;
  justUpdatedApplication = false;
  lastApplicationCode: string | null = null;
  copiedApplicationCode = false;

  credentialsModal: {
    isOpen: boolean;
    title: string;
    subtitle: string;
    accessPass: string;
    pin: string;
    extraInfo?: string;
    nextRoute?: string;
    autoLoginEmail?: string;
    autoLoginRole?: string;
    copiedPass: boolean;
    copiedPin: boolean;
    copiedAll: boolean;
  } | null = null;

  customAlertModal: {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'error';
  } | null = null;

  openCredentialsModal(title: string, subtitle: string, accessPass: string, pin: string, extraInfo?: string, nextRoute?: string, autoLoginEmail?: string, autoLoginRole?: string) {
    this.credentialsModal = {
      isOpen: true,
      title,
      subtitle,
      accessPass,
      pin,
      extraInfo,
      nextRoute,
      autoLoginEmail,
      autoLoginRole,
      copiedPass: false,
      copiedPin: false,
      copiedAll: false
    };
  }

  copyText(type: 'pass' | 'pin' | 'all') {
    if (!this.credentialsModal) return;
    let textToCopy = '';
    if (type === 'pass') {
      textToCopy = this.credentialsModal.accessPass;
      this.credentialsModal.copiedPass = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedPass = false; }, 2500);
    } else if (type === 'pin') {
      textToCopy = this.credentialsModal.pin;
      this.credentialsModal.copiedPin = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedPin = false; }, 2500);
    } else if (type === 'all') {
      const pinPart = this.credentialsModal.pin ? `\nPIN: ${this.credentialsModal.pin}` : '';
      textToCopy = `Access Pass: ${this.credentialsModal.accessPass}${pinPart}`;
      this.credentialsModal.copiedAll = true;
      setTimeout(() => { if (this.credentialsModal) this.credentialsModal.copiedAll = false; }, 2500);
    }
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {}
      });
    }
  }

  proceedFromCredentialsModal() {
    const route = this.credentialsModal?.nextRoute;
    const email = this.credentialsModal?.autoLoginEmail;
    const role = this.credentialsModal?.autoLoginRole;
    this.credentialsModal = null;

    if (email && role) {
setAuthValue('activeUserEmail', email);
  setAuthValue('activeRoleId', role);
    }

    if (route) {
      this.router.navigate([route]);
    } else if (role === 'judge') {
      this.router.navigate(['/judge']);
    } else if (role === 'sponsor') {
      this.router.navigate(['/sponsors']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  showCustomAlert(message: string, title = 'Notice', type: 'success' | 'warning' | 'info' | 'error' = 'info') {
    this.customAlertModal = {
      isOpen: true,
      title,
      message,
      type
    };
  }

  today = new Date();

  closeCustomAlert() {
    this.customAlertModal = null;
  }

  schoolForm = {
    name: '',
    category: 'Public High School',
    region: 'Greater Accra',
    district: '',
    tel: '',
    email: '',
    gps: '',
    repName: '',
    repEmail: '',
    repTel: '',
    students: [] as any[],
    teams: [] as any[],
    acceptedTerms: false,
    gdpaConsent: false,
    gdpaConsentTimestamp: ''
  };

  onConsentChanged(): void {
    if (this.schoolForm.gdpaConsent) {
      this.schoolForm.gdpaConsentTimestamp = new Date().toISOString();
    } else {
      this.schoolForm.gdpaConsentTimestamp = '';
    }
    this.tryAutoSave();
  }

  gpsLoading = false;
  gpsAddress = '';
  gpsAccuracyWarning = '';
  gpsLookupLoading = false;

  isGpsSearchModalOpen = false;
  gpsSearchQuery = '';
  gpsSearchResults: Array<{ name: string; address: string; lat: string; lng: string }> = [];
  gpsSearching = false;
  gpsSearchError = '';
  gpsSelectedPreview: { name: string; address: string; lat: string; lng: string } | null = null;

  getMapPreviewUrl(lat: string, lng: string): string {
    const latStr = encodeURIComponent(lat.trim());
    const lngStr = encodeURIComponent(lng.trim());
    return `https://maps.google.com/maps?q=${latStr},${lngStr}&hl=en&z=17&output=embed`;
  }

  getMapLinkUrl(lat: string, lng: string): string {
    return `https://www.google.com/maps?q=${lat},${lng}&z=17`;
  }

  private ghanaSchoolsGpsDb: Array<{ name: string; address: string; lat: string; lng: string; aliases?: string[] }> = [
    // Western Region
    { name: 'Ghana Secondary Technical School (GSTS)', address: 'Takoradi, Western Region', lat: '4.897719', lng: '-1.749927', aliases: ['gsts', 'ghana secondary technical', 'takoradi tech'] },
    { name: 'Archbishop Porter Girls\' Senior High School', address: 'Fijai, Takoradi, Western Region', lat: '4.941459', lng: '-1.748635', aliases: ['porter girls', 'apgss', 'archbishop porter'] },
    { name: 'Fijai Senior High School', address: 'Fijai, Sekondi-Takoradi, Western Region', lat: '4.938800', lng: '-1.751600', aliases: ['fijai', 'fisa'] },
    { name: 'Sekondi College (SEKCO)', address: 'Inchaban, Sekondi, Western Region', lat: '4.946400', lng: '-1.712800', aliases: ['sekco'] },
    { name: 'Takoradi Senior High School (TADISCO)', address: 'Tanokrom, Takoradi, Western Region', lat: '4.896500', lng: '-1.776200', aliases: ['tadisco'] },
    { name: 'Tarkwa Senior High School', address: 'Tarkwa, Western Region', lat: '5.302100', lng: '-1.984500', aliases: ['tarcisco'] },
    { name: 'University of Mines and Technology (UMaT)', address: 'Tarkwa, Western Region', lat: '5.298200', lng: '-1.996100', aliases: ['umat'] },
    { name: 'Takoradi Technical University (TTU)', address: 'Takoradi, Western Region', lat: '4.901500', lng: '-1.762000', aliases: ['ttu'] },

    // Greater Accra Region
    { name: 'Achimota School', address: 'Achimota, Accra, Greater Accra Region', lat: '5.623450', lng: '-0.218900', aliases: ['motown', 'achimota'] },
    { name: 'Presbyterian Boys\' Secondary School (PRESEC Legon)', address: 'Legon, Accra, Greater Accra Region', lat: '5.659600', lng: '-0.177200', aliases: ['presec', 'odade3'] },
    { name: 'Accra Academy', address: 'Bubuashie, Accra, Greater Accra Region', lat: '5.572100', lng: '-0.244800', aliases: ['bleoo', 'accra academy'] },
    { name: 'St. Thomas Aquinas Senior High School', address: 'Cantonments, Accra, Greater Accra Region', lat: '5.578900', lng: '-0.171400', aliases: ['aquinas', 'old tombs'] },
    { name: 'Accra High School', address: 'Asylum Down, Accra, Greater Accra Region', lat: '5.568400', lng: '-0.201200', aliases: ['ahisco'] },
    { name: 'Wesley Grammar School', address: 'Dansoman, Accra, Greater Accra Region', lat: '5.554200', lng: '-0.263100', aliases: ['wesg'] },
    { name: 'Labone Senior High School', address: 'Labone, Accra, Greater Accra Region', lat: '5.571400', lng: '-0.162300', aliases: ['labone'] },
    { name: 'Odorgonno Senior High School', address: 'Awoshie, Accra, Greater Accra Region', lat: '5.592100', lng: '-0.284500', aliases: ['odorgonno'] },
    { name: 'Tema Senior High School (TEMASCO)', address: 'Community 5, Tema, Greater Accra Region', lat: '5.674100', lng: '-0.012300', aliases: ['temasco'] },
    { name: 'Ghanata Senior High School', address: 'Dodowa, Greater Accra Region', lat: '5.881200', lng: '-0.093400', aliases: ['ghanata'] },
    { name: 'University of Ghana (UG Legon)', address: 'Legon Boundary, Accra, Greater Accra Region', lat: '5.650800', lng: '-0.187000', aliases: ['ug', 'legon'] },
    { name: 'University of Professional Studies, Accra (UPSA)', address: 'Madina-Legon, Accra, Greater Accra Region', lat: '5.661200', lng: '-0.168400', aliases: ['upsa'] },
    { name: 'Accra Technical University (ATU)', address: 'Barnes Road, Accra, Greater Accra Region', lat: '5.551200', lng: '-0.203400', aliases: ['atu', 'accra poly'] },

    // Ashanti Region
    { name: 'Prempeh College', address: 'Sofoline, Kumasi, Ashanti Region', lat: '6.697200', lng: '-1.646800', aliases: ['amanfoo', 'prempeh'] },
    { name: 'Opoku Ware School (OWASS)', address: 'Santasi, Kumasi, Ashanti Region', lat: '6.671900', lng: '-1.637500', aliases: ['owass', 'akatasuo'] },
    { name: 'Kumasi Academy', address: 'Asokore Mampong, Kumasi, Ashanti Region', lat: '6.702300', lng: '-1.584100', aliases: ['kumaca'] },
    { name: 'Yaa Asantewaa Girls\' Senior High School', address: 'Tanoso, Kumasi, Ashanti Region', lat: '6.709200', lng: '-1.691400', aliases: ['yagshs', 'adehyee'] },
    { name: 'St. Louis Senior High School', address: 'Oduom, Kumasi, Ashanti Region', lat: '6.692300', lng: '-1.564500', aliases: ['st louis'] },
    { name: 'Kumasi High School', address: 'Gyinyase, Kumasi, Ashanti Region', lat: '6.663400', lng: '-1.591200', aliases: ['kuhis', 'mmerante3'] },
    { name: 'T.I. Ahmadiyya Senior High School (AMASS Kumasi)', address: 'Kumasi, Ashanti Region', lat: '6.687200', lng: '-1.614500', aliases: ['amass', 'real amass'] },
    { name: 'Kwame Nkrumah University of Science and Technology (KNUST)', address: 'Kumasi, Ashanti Region', lat: '6.674500', lng: '-1.571600', aliases: ['knust', 'tech'] },
    { name: 'Kumasi Technical University (KsTU)', address: 'Kumasi, Ashanti Region', lat: '6.698400', lng: '-1.621200', aliases: ['kstu'] },

    // Central Region
    { name: 'Mfantsipim School', address: 'Cape Coast, Central Region', lat: '5.114700', lng: '-1.252300', aliases: ['kwabotwe', 'mfantsipim'] },
    { name: 'Adisadel College', address: 'Cape Coast, Central Region', lat: '5.123900', lng: '-1.272100', aliases: ['adisco', 'santaclausians'] },
    { name: 'Holy Child School', address: 'Cape Coast, Central Region', lat: '5.118900', lng: '-1.261200', aliases: ['holico'] },
    { name: 'Wesley Girls\' High School', address: 'Cape Coast, Central Region', lat: '5.132800', lng: '-1.276400', aliases: ['wey gey hey', 'wesley girls'] },
    { name: 'St. Augustine\'s College', address: 'Cape Coast, Central Region', lat: '5.105400', lng: '-1.289100', aliases: ['augusco', 'st augustines'] },
    { name: 'Ghana National College', address: 'Cape Coast, Central Region', lat: '5.139200', lng: '-1.258900', aliases: ['national', 'ghana national'] },
    { name: 'Aggrey Memorial A.M.E. Zion Senior High School', address: 'Cape Coast, Central Region', lat: '5.148200', lng: '-1.231400', aliases: ['aggrey memorial'] },
    { name: 'University of Cape Coast (UCC)', address: 'Cape Coast, Central Region', lat: '5.115500', lng: '-1.282500', aliases: ['ucc'] },

    // Eastern Region
    { name: 'St. Peter\'s Senior High School', address: 'Nkwatia Kwahu, Eastern Region', lat: '6.621400', lng: '-0.738900', aliases: ['persco', 'st peters'] },
    { name: 'Pope John Senior High School and Minor Seminary', address: 'Effiduase, Koforidua, Eastern Region', lat: '6.112400', lng: '-0.247800', aliases: ['pojoss', 'pope john'] },
    { name: 'Aburi Girls\' Senior High School', address: 'Aburi, Eastern Region', lat: '5.854100', lng: '-0.174600', aliases: ['abugiss', 'aburi girls'] },
    { name: 'Koforidua Senior High Technical School (SECTECH)', address: 'Koforidua, Eastern Region', lat: '6.094500', lng: '-0.261200', aliases: ['sectech', 'koforidua sec tech'] },
    { name: 'Krobo Girls\' Senior High School', address: 'Odumase Krobo, Eastern Region', lat: '6.128400', lng: '0.003400', aliases: ['krogiss'] },
    { name: 'Ghana Senior High School (GHANASS)', address: 'Koforidua, Eastern Region', lat: '6.101200', lng: '-0.256700', aliases: ['ghanass'] },

    // Volta Region
    { name: 'Mawuli School', address: 'Ho, Volta Region', lat: '6.611200', lng: '0.472300', aliases: ['mawuli'] },
    { name: 'Bishop Herman College', address: 'Kpando, Volta Region', lat: '6.993400', lng: '0.291200', aliases: ['biheco', 'bishop herman'] },
    { name: 'Keta Senior High Technical School (KETASCO)', address: 'Dzelukope, Keta, Volta Region', lat: '5.923400', lng: '0.978100', aliases: ['ketasco'] },
    { name: 'OLA Girls\' Senior High School', address: 'Ho, Volta Region', lat: '6.602100', lng: '0.463400', aliases: ['ola girls ho'] },
    { name: 'University of Health and Allied Sciences (UHAS)', address: 'Ho, Volta Region', lat: '6.643200', lng: '0.491200', aliases: ['uhas'] },

    // Northern, Upper East & Upper West
    { name: 'Tamale Senior High School (TAMASCO)', address: 'Tamale, Northern Region', lat: '9.407500', lng: '-0.839300', aliases: ['tamasco'] },
    { name: 'Ghana Senior High School (GHANASCO Tamale)', address: 'Tamale, Northern Region', lat: '9.389200', lng: '-0.824500', aliases: ['ghanasco'] },
    { name: 'Bolgatanga Senior High School (BIG BOSS)', address: 'Winkogo, Bolgatanga, Upper East Region', lat: '10.743200', lng: '-0.884500', aliases: ['big boss', 'bolga shs'] },
    { name: 'Navrongo Senior High School (NAVASCO)', address: 'Navrongo, Upper East Region', lat: '10.892100', lng: '-1.084500', aliases: ['navasco'] },
    { name: 'Wa Senior High School', address: 'Wa, Upper West Region', lat: '10.061200', lng: '-2.512400', aliases: ['wa shs'] },
    { name: 'University for Development Studies (UDS)', address: 'Dungu, Tamale, Northern Region', lat: '9.358200', lng: '-0.852100', aliases: ['uds'] },

    // Bono & Ahafo Regions
    { name: 'Sunyani Senior High School (SUSEC)', address: 'Sunyani, Bono Region', lat: '7.342100', lng: '-2.324500', aliases: ['susec'] },
    { name: 'St. James Seminary and Senior High School', address: 'Abesim, Sunyani, Bono Region', lat: '7.301200', lng: '-2.284500', aliases: ['st james sunyani', 'seminary'] },
    { name: 'University of Energy and Natural Resources (UENR)', address: 'Sunyani, Bono Region', lat: '7.354100', lng: '-2.341200', aliases: ['uenr'] },

    // Private & International Academies
    { name: 'Ghana International School (GIS)', address: 'Cantonments, Accra, Greater Accra Region', lat: '5.581200', lng: '-0.174500', aliases: ['gis', 'ghana international'] },
    { name: 'SOS-Hermann Gmeiner International College (SOS-HGIC)', address: 'Tema Community 6, Greater Accra Region', lat: '5.681200', lng: '-0.008900', aliases: ['sos', 'sos-hgic', 'hgic'] },
    { name: 'Tema International School (TIS)', address: 'Tema Community 22, Greater Accra Region', lat: '5.714500', lng: '0.012400', aliases: ['tis'] },
    { name: 'Lincoln Community School', address: 'Abelemkpe, Accra, Greater Accra Region', lat: '5.608900', lng: '-0.208400', aliases: ['lincoln'] },
    { name: 'Galaxy International School', address: 'Ashaley Botwe, Accra, Greater Accra Region', lat: '5.678900', lng: '-0.141200', aliases: ['galaxy'] },
    { name: 'Morning Star School', address: 'Cantonments, Accra, Greater Accra Region', lat: '5.574500', lng: '-0.178900', aliases: ['morning star'] },
    { name: 'Faith Montessori School', address: 'Airport West, Accra, Greater Accra Region', lat: '5.602100', lng: '-0.188400', aliases: ['faith montessori'] },
    { name: 'The Roman Ridge School', address: 'Roman Ridge, Accra, Greater Accra Region', lat: '5.594500', lng: '-0.191200', aliases: ['roman ridge'] },
    { name: 'Alpha Beta Education Centres', address: 'Dansoman, Accra, Greater Accra Region', lat: '5.548900', lng: '-0.271200', aliases: ['alpha beta'] },
    { name: 'British International School (BIS)', address: 'East Legon, Accra, Greater Accra Region', lat: '5.641200', lng: '-0.148900', aliases: ['bis', 'british international'] }
  ];

  openSchoolGpsModal(): void {
    this.isGpsSearchModalOpen = true;
    this.gpsSearchQuery = this.schoolForm.name?.trim() || '';
    this.gpsSearchError = '';
    this.searchSchoolGps();
  }

  closeSchoolGpsModal(): void {
    this.isGpsSearchModalOpen = false;
    this.gpsSelectedPreview = null;
  }

  async searchSchoolGps(): Promise<void> {
    const rawQuery = (this.gpsSearchQuery || '').trim();
    const q = rawQuery.toLowerCase();
    this.gpsSearching = true;
    this.gpsSearchError = '';
    this.gpsSearchResults = [];

    // 1. First search local Ghanaian schools database using token matching & aliases
    const searchTokens = q.split(/[\s,.-]+/).filter(t => t.length > 1 && t !== 'school' && t !== 'shs' && t !== 'senior' && t !== 'high');
    const localMatches = this.ghanaSchoolsGpsDb.filter(s => {
      if (!q) return true;
      const sName = s.name.toLowerCase();
      const sAddr = s.address.toLowerCase();
      const sAliases = (s.aliases || []).map(a => a.toLowerCase());

      // Direct match or alias match
      if (sName.includes(q) || sAddr.includes(q) || sAliases.some(a => a.includes(q) || q.includes(a))) {
        return true;
      }

      // Token intersection match (e.g. "ghana secondary technical" matches "Ghana Secondary Technical School (GSTS)")
      if (searchTokens.length > 0) {
        const matchesAllTokens = searchTokens.every(t => sName.includes(t) || sAddr.includes(t) || sAliases.some(a => a.includes(t)));
        if (matchesAllTokens) return true;
      }

      return false;
    });

    this.gpsSearchResults = [...localMatches];

    // 2. Perform live search with Photon API (free, fast, no API key required)
    if (q) {
      try {
        const photonQueries = [
          rawQuery,
          `${rawQuery} Ghana`
        ];
        for (const pq of photonQueries) {
          const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(pq)}&limit=8&lat=5.6&lon=-0.2`;
          const pRes = await fetch(photonUrl);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData?.features && Array.isArray(pData.features)) {
              for (const feat of pData.features) {
                const coords = feat.geometry?.coordinates;
                const props = feat.properties || {};
                if (coords && coords.length >= 2) {
                  const lng = parseFloat(coords[0]).toFixed(6);
                  const lat = parseFloat(coords[1]).toFixed(6);
                  // Check if in Ghana bounding box (lat: 4.5 to 11.5, lng: -3.5 to 1.5)
                  const latNum = parseFloat(lat);
                  const lngNum = parseFloat(lng);
                  const inGhana = (props.countrycode === 'GH' || props.country === 'Ghana') || 
                                  (latNum >= 4.5 && latNum <= 11.5 && lngNum >= -3.5 && lngNum <= 1.5);
                  if (inGhana) {
                    const name = props.name || rawQuery;
                    const addrParts = [props.street, props.district, props.city, props.state, props.country || 'Ghana'].filter(Boolean);
                    const address = addrParts.join(', ') || 'Ghana';
                    if (!this.gpsSearchResults.some(r => Math.abs(parseFloat(r.lat) - latNum) < 0.0002 && Math.abs(parseFloat(r.lng) - lngNum) < 0.0002)) {
                      this.gpsSearchResults.push({ name, address, lat, lng });
                    }
                  }
                }
              }
            }
          }
          if (this.gpsSearchResults.length > localMatches.length) break;
        }
      } catch {
        // Fall through to Nominatim
      }

      // 3. Fallback to OpenStreetMap Nominatim search
      const queryVariants = [
        rawQuery,
        `${rawQuery}, Ghana`
      ];

      for (const queryVariant of queryVariants) {
        try {
          const queryEncoded = encodeURIComponent(queryVariant);
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${queryEncoded}&countrycodes=gh&limit=8`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              for (const item of data) {
                const lat = parseFloat(item.lat).toFixed(6);
                const lng = parseFloat(item.lon).toFixed(6);
                const name = item.name || (item.display_name ? item.display_name.split(',')[0] : 'Location in Ghana');
                const address = item.display_name || '';
                if (!this.gpsSearchResults.some(r => Math.abs(parseFloat(r.lat) - parseFloat(lat)) < 0.0002 && Math.abs(parseFloat(r.lng) - parseFloat(lng)) < 0.0002)) {
                  this.gpsSearchResults.push({ name, address, lat, lng });
                }
              }
              break;
            }
          }
        } catch {
          // Network issues handled gracefully
        }
      }
    }

    if (this.gpsSearchResults.length === 0) {
      this.gpsSearchError = 'No matching schools or landmarks found in Ghana. Try searching by short name (e.g. GSTS, Prempeh) or city.';
      this.gpsSelectedPreview = null;
    } else {
      this.gpsSelectedPreview = this.gpsSearchResults[0];
    }

    this.gpsSearching = false;
  }

  selectSchoolGps(result: { name: string; address: string; lat: string; lng: string }): void {
    this.schoolForm.gps = `${result.lat}, ${result.lng}`;
    this.gpsAddress = result.address || result.name;
    this.gpsAccuracyWarning = '';
    this.isGpsSearchModalOpen = false;
    this.gpsSelectedPreview = null;
    this.notificationService.success(`Applied GPS coordinates for ${result.name}`, 'GPS Coordinates Set');
    this.tryAutoSave();
  }

  previewSchoolGps(result: { name: string; address: string; lat: string; lng: string }, event: Event): void {
    event.stopPropagation();
    this.gpsSelectedPreview = result;
  }

  studentForm = {
    name: '',
    id: '',
    email: '',
    dob: '',
    gender: '',
    school: '',
    class: '',
    region: 'Greater Accra',
    guardianName: '',
    guardianPhone: '',
    track: 'coding',
    skills: {
      alg: 'intermediate',
      hw: 'novice',
      ai: 'novice'
    }
  };

  teamForm = {
    name: '',
    school: '',
    region: 'Greater Accra',
    track: '',
    leadName: '',
    leadEmail: '',
    member2Name: '',
    member2Email: '',
    member3Name: '',
    member3Email: '',
    member4Name: '',
    member4Email: '',
    member5Name: '',
    member5Email: '',
    skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
  };

  instructorForm = {
    name: '',
    tel: '',
    email: '',
    address: '',
    region: 'Greater Accra',
    qualification: 'BSc',
    institution: '',
    isIndependent: false,
    acceptedTerms: false,
    portfolio: '',
    expertise: {
      Python: false,
      JavaScript: false,
      'C#': false,
      AI: false,
      Robotics: false,
      Cybersecurity: false,
      'Data Science': false
    } as { [key: string]: boolean }
  };

  judgeForm = {
    name: '',
    tel: '',
    email: '',
    organization: '',
    region: 'Greater Accra',
    expertise: '',
    experience: '',
    bio: '',
    ticketCode: '',
    otp: '',
    acceptedTerms: false
  };

  sponsorForm = {
    name: '',
    sector: 'Energy & Mining',
    repName: '',
    repContact: '',
    email: '',
    region: 'Greater Accra',
    package: '',
    acceptedTerms: false,
    arenas: {
      'Coding Track': true,
      'Robotics Arena': true,
      'AI & ML Challenge': true,
      'Cyber Security CTF': true,
      'Open Innovation': true
    } as { [key: string]: boolean }
  };

  openRegForm = {
    fullName: '',
    email: '',
    phone: '',
    ageGroup: 'junior',
    experienceLevel: 'beginner',
    organization: '',
    selectedCompetitionId: '',
    acceptedTerms: false,
    emailVerified: false,
    phoneVerified: false
  };

  openRegPhotoUrl: string | null = null;
  openRegDocName: string | null = null;
  openRegPhotoFileId: string | null = null;
  openRegDocFileId: string | null = null;

  availableOpenCompetitions: any[] = [];

  ageGroups = [
    { value: 'junior', label: 'Junior (13-17)', icon: 'person_raised_hand' },
    { value: 'senior', label: 'Senior (18+)', icon: 'person' },
    { value: 'open', label: 'Open Category', icon: 'groups' }
  ];

  experienceLevels = [
    { value: 'beginner', label: 'Beginner', icon: 'school' },
    { value: 'intermediate', label: 'Intermediate', icon: 'trending_up' },
    { value: 'advanced', label: 'Advanced', icon: 'rocket_launch' }
  ];

  // ── LIVE VALIDATION STATE ────────────────────────────────────────
  // `serverConfirmed` marks a 'taken' that came from GET /api/auth/check-availability
  // rather than from an in-form rule. Sibling revalidation must not clear those:
  // it used to decide a field was 'valid' from contentService.isEmailTaken, which
  // scans the admin-only roster and is always false for a public registrant, so a
  // real "already registered" warning was wiped the moment the user edited the
  // neighbouring field.
  fieldValidation: Record<string, { status: 'idle' | 'checking' | 'valid' | 'taken' | 'invalid' | 'draft_found'; message: string; serverConfirmed?: boolean }> = {};
  private validationTimers: Record<string, any> = {};

  clearValidationState(): void {
    this.fieldValidation = {};
    this.verifiedValues = {};
    for (const key in this.validationTimers) {
      if (this.validationTimers[key]) clearTimeout(this.validationTimers[key]);
    }
    this.validationTimers = {};
  }

  readonly DRAFT_TTL_DAYS = 7; // Drafts automatically expire after 7 days of inactivity

  purgeExpiredDrafts(): void {
    try {
      const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
      const now = Date.now();
      let modified = false;

      for (const key in drafts) {
        const d = drafts[key];
        const savedTime = d?.savedAt ? new Date(d.savedAt).getTime() : now;
        const expiresAt = d?.expiresAt || (savedTime + this.DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
        if (now > expiresAt) {
          delete drafts[key];
          modified = true;
        }
      }

      if (modified) {
        localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
      }
    } catch {}
  }

  getDraftTimeRemaining(contact: string): string {
    try {
      this.purgeExpiredDrafts();
      const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
      const key = contact?.trim().toLowerCase();
      const draft = drafts[key] || drafts[contact];
      if (!draft) return '';

      const now = Date.now();
      const savedTime = draft.savedAt ? new Date(draft.savedAt).getTime() : now;
      const expiresAt = draft.expiresAt || (savedTime + this.DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
      const remainingMs = expiresAt - now;

      if (remainingMs <= 0) return 'expired';

      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      if (remainingHours > 24) {
        const days = Math.ceil(remainingHours / 24);
        return `${days} ${days === 1 ? 'day' : 'days'} left`;
      }
      return `${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'} left`;
    } catch {
      return '';
    }
  }

  hasSavedDraft(contact: string): boolean {
    if (!contact || !contact.trim()) return false;
    this.purgeExpiredDrafts();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    const key = contact.trim().toLowerCase();
    return !!(drafts[key] || drafts[contact]);
  }

  resumeDraftFromField(contact: string): void {
    if (!contact || !contact.trim()) return;
    this.verificationMethod = contact.includes('@') ? 'email' : 'mobile';
    this.verificationInput = contact.trim();
    this.sendOTP();
  }

  validateEmailLive(fieldName: string, value: string): void {
    if (this.validationTimers[fieldName]) clearTimeout(this.validationTimers[fieldName]);
    if (!value || !value.trim()) {
      this.fieldValidation[fieldName] = { status: 'idle', message: '' };
      delete this.verifiedValues[fieldName];
      return;
    }
    const cleanVal = value.trim().toLowerCase();
    if (this.verifiedValues[fieldName] && this.verifiedValues[fieldName] !== cleanVal) {
      delete this.verifiedValues[fieldName];
    }
    this.fieldValidation[fieldName] = { status: 'checking', message: 'Checking...' };
    this.validationTimers[fieldName] = setTimeout(() => {
      if (!value || !value.trim()) {
        this.fieldValidation[fieldName] = { status: 'idle', message: '' };
        delete this.verifiedValues[fieldName];
        this.revalidateSiblingFields(fieldName, 'email');
        return;
      }
      if (!this.contentService.isValidEmail(value)) {
        this.fieldValidation[fieldName] = { status: 'invalid', message: 'Invalid email format' };
        this.revalidateSiblingFields(fieldName, 'email');
        return;
      }
      if (this.isDuplicateInForm(fieldName, value)) {
        const msg = this.activeTab === 'school' && (fieldName === 'schoolEmail' || fieldName === 'schoolRepEmail')
          ? 'School email and representative email cannot be the same'
          : 'This email is already in use by another role or member in your form';
        this.fieldValidation[fieldName] = { status: 'taken', message: msg };
        this.revalidateSiblingFields(fieldName, 'email');
        return;
      }
      if (this.hasSavedDraft(value) && !this.isDraftResumed) {
        const timeRemaining = this.getDraftTimeRemaining(value);
        const timeText = timeRemaining ? ` (${timeRemaining})` : '';
        this.fieldValidation[fieldName] = { status: 'draft_found', message: `This email is reserved by a saved draft${timeText}. Resume the draft or wait for expiry.` };
        this.revalidateSiblingFields(fieldName, 'email');
        return;
      }
      if (this.contentService.isEmailTaken(value, this.editingApprovalId || undefined)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'This email is already registered to an account' };
        this.revalidateSiblingFields(fieldName, 'email');
        return;
      }

      // Check PostgreSQL backend database in real time
      this.apiService.checkAvailability(cleanVal, '').subscribe({
        next: (res) => {
          if (res && res.email_taken) {
            this.fieldValidation[fieldName] = { status: 'taken', message: 'This email is already registered to an account', serverConfirmed: true };
          } else {
            this.fieldValidation[fieldName] = { status: 'valid', message: '' };
          }
          this.revalidateSiblingFields(fieldName, 'email');
        },
        error: () => {
          this.fieldValidation[fieldName] = { status: 'valid', message: '' };
          this.revalidateSiblingFields(fieldName, 'email');
        }
      });
    }, 350);
  }

  private isDuplicateInForm(fieldName: string, value: string): boolean {
    const v = value.trim().toLowerCase();
    if (!v) return false;

    // Direct school sibling check
    if (this.activeTab === 'school') {
      if (fieldName === 'schoolEmail') return (this.schoolForm.repEmail || '').trim().toLowerCase() === v;
      if (fieldName === 'schoolRepEmail') return (this.schoolForm.email || '').trim().toLowerCase() === v;
    }

    // Direct squad roster check
    if (this.activeTab === 'team' || (this.activeTab === 'student' && this.competitorMode === 'group')) {
      const squadEmails: { name: string; value: string }[] = [
        { name: 'squadLeadEmail', value: this.teamForm.leadEmail },
        { name: 'squadM2Email', value: this.teamForm.member2Email },
        { name: 'squadM3Email', value: this.teamForm.member3Email },
        { name: 'squadM4Email', value: this.teamForm.member4Email },
        { name: 'squadM5Email', value: this.teamForm.member5Email },
      ];
      return squadEmails.some(e => e.name !== fieldName && e.value?.trim().toLowerCase() === v);
    }

    return false;
  }

  private normalizePhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('233') && digits.length >= 12) {
      return digits.substring(3);
    }
    if (digits.startsWith('0') && digits.length >= 10) {
      return digits.substring(1);
    }
    return digits;
  }

  private isDuplicatePhoneInForm(fieldName: string, value: string): boolean {
    const v = this.normalizePhone(value);
    if (!v) return false;
    if (this.activeTab === 'school') {
      if (fieldName === 'schoolTel') return this.normalizePhone(this.schoolForm.repTel) === v;
      if (fieldName === 'schoolRepTel') return this.normalizePhone(this.schoolForm.tel) === v;
    }
    return false;
  }

  private revalidateSiblingFields(currentFieldName: string, type: 'email' | 'phone'): void {
    // Never downgrade a server-confirmed 'taken' to 'valid'. The local
    // isEmailTaken/isPhoneTaken fall back to an admin-only roster, so for a
    // public registrant they always say "free" -- which used to silently erase a
    // genuine "already registered" warning on the sibling field.
    const serverSaysTaken = (field: string) =>
      this.fieldValidation[field]?.status === 'taken' && this.fieldValidation[field]?.serverConfirmed === true;

    if (this.activeTab === 'school') {
      if (type === 'email') {
        const sibling = currentFieldName === 'schoolEmail' ? 'schoolRepEmail' : currentFieldName === 'schoolRepEmail' ? 'schoolEmail' : null;
        if (sibling && this.fieldValidation[sibling] && this.fieldValidation[sibling].status !== 'idle') {
          const val = sibling === 'schoolEmail' ? this.schoolForm.email : this.schoolForm.repEmail;
          if (val && val.trim()) {
            if (!this.contentService.isValidEmail(val)) {
              this.fieldValidation[sibling] = { status: 'invalid', message: 'Invalid email format' };
            } else if (this.isDuplicateInForm(sibling, val)) {
              this.fieldValidation[sibling] = { status: 'taken', message: 'School email and representative email cannot be the same' };
            } else if (!serverSaysTaken(sibling) && !this.contentService.isEmailTaken(val, this.editingApprovalId || undefined)) {
              this.fieldValidation[sibling] = { status: 'valid', message: '' };
            }
          }
        }
      } else if (type === 'phone') {
        const sibling = currentFieldName === 'schoolTel' ? 'schoolRepTel' : currentFieldName === 'schoolRepTel' ? 'schoolTel' : null;
        if (sibling && this.fieldValidation[sibling] && this.fieldValidation[sibling].status !== 'idle') {
          const val = sibling === 'schoolTel' ? this.schoolForm.tel : this.schoolForm.repTel;
          if (val && val.trim()) {
            if (!this.contentService.isValidGhanaPhone(val)) {
              this.fieldValidation[sibling] = { status: 'invalid', message: 'Enter a valid Ghana number (0XX XXX XXXX or +233...)' };
            } else if (this.isDuplicatePhoneInForm(sibling, val)) {
              this.fieldValidation[sibling] = { status: 'taken', message: 'School telephone and representative telephone cannot be the same' };
            } else if (!serverSaysTaken(sibling) && !this.contentService.isPhoneTaken(val, this.editingApprovalId || undefined)) {
              this.fieldValidation[sibling] = { status: 'valid', message: '' };
            }
          }
        }
      }
    } else if (type === 'email') {
      this.revalidateOtherSquadEmails(currentFieldName);
    }
  }

  private revalidateOtherSquadEmails(currentFieldName: string): void {
    if (this.activeTab === 'team' || (this.activeTab === 'student' && this.competitorMode === 'group')) {
      const fields = ['squadLeadEmail', 'squadM2Email', 'squadM3Email', 'squadM4Email', 'squadM5Email'];
      fields.filter(f => f !== currentFieldName).forEach(f => {
        const val = this.getSquadEmailValue(f);
        if (val && this.fieldValidation[f] && (this.fieldValidation[f].status === 'valid' || this.fieldValidation[f].status === 'taken')) {
          const serverTaken = this.fieldValidation[f].status === 'taken' && this.fieldValidation[f].serverConfirmed === true;
          if (this.isDuplicateInForm(f, val)) {
            this.fieldValidation[f] = { status: 'taken', message: 'Duplicate email used by another squad member' };
          } else if (!serverTaken && !this.contentService.isEmailTaken(val, this.editingApprovalId || undefined)) {
            this.fieldValidation[f] = { status: 'valid', message: '' };
          }
        }
      });
    }
  }

  private getSquadEmailValue(fieldName: string): string {
    if (fieldName === 'squadLeadEmail') return this.teamForm.leadEmail || '';
    if (fieldName === 'squadM2Email') return this.teamForm.member2Email || '';
    if (fieldName === 'squadM3Email') return this.teamForm.member3Email || '';
    if (fieldName === 'squadM4Email') return this.teamForm.member4Email || '';
    if (fieldName === 'squadM5Email') return this.teamForm.member5Email || '';
    return '';
  }

  validatePhoneLive(fieldName: string, value: string): void {
    if (this.validationTimers[fieldName]) clearTimeout(this.validationTimers[fieldName]);
    if (!value || !value.trim()) {
      this.fieldValidation[fieldName] = { status: 'idle', message: '' };
      delete this.fieldVerified[fieldName];
      this.revalidateSiblingFields(fieldName, 'phone');
      return;
    }
    this.fieldValidation[fieldName] = { status: 'checking', message: 'Checking...' };
    this.validationTimers[fieldName] = setTimeout(() => {
      if (!value || !value.trim()) {
        this.fieldValidation[fieldName] = { status: 'idle', message: '' };
        delete this.fieldVerified[fieldName];
        this.revalidateSiblingFields(fieldName, 'phone');
        return;
      }
      if (!this.contentService.isValidGhanaPhone(value)) {
        this.fieldValidation[fieldName] = { status: 'invalid', message: 'Enter a valid Ghana number (0XX XXX XXXX or +233...)' };
        this.revalidateSiblingFields(fieldName, 'phone');
        return;
      }
      if (this.isDuplicatePhoneInForm(fieldName, value)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'School telephone and representative telephone cannot be the same' };
        this.revalidateSiblingFields(fieldName, 'phone');
        return;
      }
      if (this.hasSavedDraft(value) && !this.isDraftResumed) {
        const timeRemaining = this.getDraftTimeRemaining(value);
        const timeText = timeRemaining ? ` (${timeRemaining})` : '';
        this.fieldValidation[fieldName] = { status: 'draft_found', message: `This number is reserved by a saved draft${timeText}. Resume the draft or wait for expiry.` };
        this.revalidateSiblingFields(fieldName, 'phone');
        return;
      }
      if (this.contentService.isPhoneTaken(value, this.editingApprovalId || undefined)) {
        this.fieldValidation[fieldName] = { status: 'taken', message: 'This number is already registered' };
        this.revalidateSiblingFields(fieldName, 'phone');
        return;
      }

      // Check PostgreSQL backend database in real time
      this.apiService.checkAvailability('', value).subscribe({
        next: (res) => {
          if (res && res.phone_taken) {
            this.fieldValidation[fieldName] = { status: 'taken', message: 'This number is already registered', serverConfirmed: true };
          } else {
            this.fieldValidation[fieldName] = { status: 'valid', message: '' };
          }
          this.revalidateSiblingFields(fieldName, 'phone');
        },
        error: () => {
          this.fieldValidation[fieldName] = { status: 'valid', message: '' };
          this.revalidateSiblingFields(fieldName, 'phone');
        }
      });
    }, 400);
  }

  hasValidationErrors(): boolean {
    return Object.values(this.fieldValidation).some(v => v.status === 'taken' || v.status === 'invalid' || v.status === 'draft_found');
  }

  private validateCurrentTab(): boolean {
    const fields: Record<string, { value: string; type: 'email' | 'phone' }> = {};
    this.missingDocsError = '';
    if (this.activeTab === 'school') {
      fields['schoolEmail'] = { value: this.schoolForm.email, type: 'email' };
      fields['schoolRepEmail'] = { value: this.schoolForm.repEmail, type: 'email' };
      fields['schoolTel'] = { value: this.schoolForm.tel, type: 'phone' };
      fields['schoolRepTel'] = { value: this.schoolForm.repTel, type: 'phone' };
      // Prevent same email for school and representative
      if (this.schoolForm.email?.trim() && this.schoolForm.repEmail?.trim() &&
          this.schoolForm.email.trim().toLowerCase() === this.schoolForm.repEmail.trim().toLowerCase()) {
        this.showCustomAlert('The school email and representative email cannot be the same. Please use distinct email addresses.', 'Duplicate Email', 'warning');
        return false;
      }
    } else if (this.activeTab === 'instructor') {
      fields['instEmail'] = { value: this.instructorForm.email, type: 'email' };
      fields['instTel'] = { value: this.instructorForm.tel, type: 'phone' };
    } else if (this.activeTab === 'judge') {
      fields['jdEmail'] = { value: this.judgeForm.email, type: 'email' };
      fields['jdTel'] = { value: this.judgeForm.tel, type: 'phone' };
    } else if (this.activeTab === 'sponsor') {
      fields['sponsEmail'] = { value: this.sponsorForm.email, type: 'email' };
      fields['sponsContact'] = { value: this.sponsorForm.repContact, type: 'phone' };
    } else if (this.activeTab === 'open') {
      fields['openEmail'] = { value: this.openRegForm.email, type: 'email' };
      fields['openPhone'] = { value: this.openRegForm.phone, type: 'phone' };
      if (!this.openRegForm.selectedCompetitionId) {
        this.showCustomAlert('Please select a competition cycle to join.', 'Missing Selection', 'warning');
        return false;
      }
    }

    let blocked = false;
    for (const [key, { value, type }] of Object.entries(fields)) {
      if (!value?.trim()) continue;
      // A server-confirmed 'taken' from the live check must block here too. The
      // local isEmailTaken/isPhoneTaken below only see the admin-only roster, so
      // on their own this loop never blocked a real duplicate for a public
      // registrant; the awaited check in submitRegistration was the only catch.
      const serverTaken = this.fieldValidation[key]?.status === 'taken'
        && this.fieldValidation[key]?.serverConfirmed === true;
      if (type === 'email') {
        if (!this.contentService.isValidEmail(value)) {
          this.fieldValidation[key] = { status: 'invalid', message: 'Invalid email format' };
          blocked = true;
        } else if (serverTaken || this.contentService.isEmailTaken(value, this.editingApprovalId || undefined)) {
          this.fieldValidation[key] = { status: 'taken', message: 'This email is already registered', serverConfirmed: serverTaken || undefined };
          blocked = true;
        } else if (this.hasSavedDraft(value) && !this.isDraftResumed) {
          const timeText = this.getDraftTimeRemaining(value);
          this.fieldValidation[key] = { status: 'draft_found', message: `This email is reserved by a saved draft${timeText ? ' (' + timeText + ')' : ''}. Resume the draft or wait for expiry.` };
          blocked = true;
        }
      } else {
        if (!this.contentService.isValidGhanaPhone(value)) {
          this.fieldValidation[key] = { status: 'invalid', message: 'Enter a valid Ghana number' };
          blocked = true;
        } else if (serverTaken || this.contentService.isPhoneTaken(value, this.editingApprovalId || undefined)) {
          this.fieldValidation[key] = { status: 'taken', message: 'This number is already registered', serverConfirmed: serverTaken || undefined };
          blocked = true;
        } else if (this.hasSavedDraft(value) && !this.isDraftResumed) {
          const timeText = this.getDraftTimeRemaining(value);
          this.fieldValidation[key] = { status: 'draft_found', message: `This number is reserved by a saved draft${timeText ? ' (' + timeText + ')' : ''}. Resume the draft or wait for expiry.` };
          blocked = true;
        }
      }
    }

    if (this.activeTab === 'school' && !(this.selectedFileIds['accredDocs']?.length)) {
      this.missingDocsError = 'Please upload your Accreditation Documents before submitting.';
      blocked = true;
    } else if (this.activeTab === 'instructor' && !(this.selectedFileIds['instructorDocs']?.length)) {
      this.missingDocsError = 'Please upload your Documents (CV, Certificates, National ID) before submitting.';
      blocked = true;
    }

    if (blocked) {
      const msg = this.missingDocsError || 'Please fix the highlighted email/phone errors before submitting.';
      this.showCustomAlert(msg, 'Validation Error', 'warning');
    }
    return !blocked;
  }

  // ── FIELD VERIFICATION + OTP ───────────────────────────────────
  verifiedValues: Record<string, string> = {};
  verifyOtpModalOpen = false;
  verifyTargetField = '';
  verifyTargetType: 'email' | 'phone' = 'email';
  verifyTargetValue = '';
  verifyOtpInput = '';
  verifyOtpError = '';
  verifyOtpSent = false;
  verifyOtpBusy = false;
  verifyOtpCountdown = 0;
  private verifyOtpTimer: any = null;
  /** Held so ngOnDestroy can unsubscribe; route params never complete. */
  private queryParamsSub?: Subscription;
  /** Opaque handle from the server. The actual code is never held client-side. */
  private verifyChallengeId = '';

  isFieldVerified(fieldName: string, currentValue?: string): boolean {
    if (!currentValue || !currentValue.trim()) return false;
    const verifiedVal = this.verifiedValues[fieldName];
    if (!verifiedVal) return false;
    const cleanCurrent = (fieldName.toLowerCase().includes('phone') || fieldName.toLowerCase().includes('tel') || fieldName.toLowerCase().includes('contact'))
      ? this.normalizePhone(currentValue)
      : currentValue.trim().toLowerCase();
    return verifiedVal === cleanCurrent;
  }

  get fieldVerified(): Record<string, boolean> {
    return {
      schoolEmail: this.isFieldVerified('schoolEmail', this.schoolForm.email),
      schoolRepTel: this.isFieldVerified('schoolRepTel', this.schoolForm.repTel),
      instEmail: this.isFieldVerified('instEmail', this.instructorForm.email),
      instTel: this.isFieldVerified('instTel', this.instructorForm.tel),
      jdEmail: this.isFieldVerified('jdEmail', this.judgeForm.email),
      jdTel: this.isFieldVerified('jdTel', this.judgeForm.tel),
      sponsEmail: this.isFieldVerified('sponsEmail', this.sponsorForm.email),
      sponsContact: this.isFieldVerified('sponsContact', this.sponsorForm.repContact),
    };
  }

  get currentTabVerified(): boolean {
    if (this.activeTab === 'school') {
      return this.isFieldVerified('schoolEmail', this.schoolForm.email) &&
             this.isFieldVerified('schoolRepTel', this.schoolForm.repTel);
    } else if (this.activeTab === 'instructor') {
      return this.isFieldVerified('instEmail', this.instructorForm.email) &&
             this.isFieldVerified('instTel', this.instructorForm.tel);
    } else if (this.activeTab === 'judge') {
      return this.isFieldVerified('jdEmail', this.judgeForm.email) &&
             this.isFieldVerified('jdTel', this.judgeForm.tel);
    } else if (this.activeTab === 'sponsor') {
      return this.isFieldVerified('sponsEmail', this.sponsorForm.email) &&
             this.isFieldVerified('sponsContact', this.sponsorForm.repContact);
    }
    return false;
  }

  canVerifyField(fieldName: string, value?: string): boolean {
    if (value !== undefined && (!value || !value.trim())) return false;
    const v = this.fieldValidation[fieldName];
    return v?.status === 'valid' && !this.isFieldVerified(fieldName, value);
  }

  sendVerifyOtp(fieldName: string, type: 'email' | 'phone', value: string): void {
    this.verifyTargetField = fieldName;
    this.verifyTargetType = type;
    this.verifyTargetValue = value;
    this.verifyOtpInput = '';
    this.verifyOtpError = '';
    this.verifyOtpSent = false;
    this.verifyChallengeId = '';
    this.verifyOtpBusy = true;

    // The server generates, stores (hashed) and later checks the code. The
    // browser only receives an opaque challenge id.
    this.otpService.request('contact_verification', type, value).subscribe({
      next: challenge => {
        this.verifyChallengeId = challenge.challengeId;
        this.verifyOtpSent = true;
        this.verifyOtpModalOpen = true;
        this.verifyOtpBusy = false;
        this.startVerifyOtpTimer(challenge.expiresIn || 60);
        this.notificationService.info(
          `A 6-digit verification code was sent to ${challenge.targetMasked}`,
          'Verification Code Sent'
        );
        this.cdr?.markForCheck?.();
      },
      error: (err: Error) => {
        this.verifyOtpBusy = false;
        this.verifyOtpError = err.message;
        this.notificationService.error(err.message, 'Could Not Send Code');
        this.cdr?.markForCheck?.();
      }
    });
  }

  startVerifyOtpTimer(seconds: number = 60): void {
    if (this.verifyOtpTimer) {
      clearInterval(this.verifyOtpTimer);
    }
    this.verifyOtpCountdown = Math.min(seconds, 60);
    this.verifyOtpTimer = setInterval(() => {
      if (this.verifyOtpCountdown > 0) {
        this.verifyOtpCountdown--;
        this.cdr?.markForCheck?.();
      } else {
        clearInterval(this.verifyOtpTimer);
        this.verifyOtpTimer = null;
        this.cdr?.markForCheck?.();
      }
    }, 1000);
  }

  resendVerifyOtp(): void {
    if (this.verifyOtpCountdown > 0 || this.verifyOtpBusy || !this.verifyTargetValue) return;
    this.sendVerifyOtp(this.verifyTargetField, this.verifyTargetType, this.verifyTargetValue);
  }

  onVerifyOtpInputChange(): void {
    if (this.verifyOtpInput && this.verifyOtpInput.length === 6) {
      this.confirmVerifyOtp();
    }
  }

  confirmVerifyOtp(): void {
    if (this.verifyOtpInput.length !== 6) {
      this.verifyOtpError = 'Enter the complete 6-digit code.';
      return;
    }
    if (!this.verifyChallengeId) {
      this.verifyOtpError = 'No verification in progress. Please request a new code.';
      return;
    }

    this.verifyOtpError = '';
    this.verifyOtpBusy = true;

    // Only the server can decide whether the code was correct.
    this.otpService.verify(this.verifyChallengeId, this.verifyOtpInput).subscribe({
      next: () => {
        this.verifyOtpBusy = false;
        const verifiedClean = this.verifyTargetType === 'email'
          ? this.verifyTargetValue.trim().toLowerCase()
          : this.normalizePhone(this.verifyTargetValue);
        this.verifiedValues[this.verifyTargetField] = verifiedClean;
        this.verifyOtpModalOpen = false;
        this.verifyChallengeId = '';
        if (this.verifyOtpTimer) {
          clearInterval(this.verifyOtpTimer);
          this.verifyOtpTimer = null;
        }
        this.notificationService.success(
          `${this.verifyTargetType === 'email' ? 'Email' : 'Phone number'} verified successfully!`,
          'Verified'
        );
        this.tryAutoSave();
        this.cdr?.markForCheck?.();
      },
      error: (err: Error) => {
        this.verifyOtpBusy = false;
        this.verifyOtpError = err.message;
        this.cdr?.markForCheck?.();
      }
    });
  }

  closeVerifyModal(): void {
    this.verifyOtpModalOpen = false;
    this.verifyOtpInput = '';
    this.verifyOtpError = '';
    this.verifyChallengeId = '';
    this.verifyOtpBusy = false;
    if (this.verifyOtpTimer) {
      clearInterval(this.verifyOtpTimer);
      this.verifyOtpTimer = null;
    }
  }

  private tryAutoSave(): void {
    if (this.currentTabVerified) {
      this.saveDraft();
    }
  }

  tracks = [
    { id: 'coding', label: 'Coding', icon: 'code' },
    { id: 'robotics', label: 'Robotics', icon: 'smart_toy' },
    { id: 'ai', label: 'AI', icon: 'psychology' },
    { id: 'cyber', label: 'Networking & Cybersecurity', icon: 'security' },
    { id: 'innovation', label: 'Innovation', icon: 'tips_and_updates' },
  ];

  recentStudents: any[] = [];

  // A hardcoded `sponsors` array of three fabricated partners (Tullow, MTN, GCB)
  // with invented amounts and status 'Confirmed' was here. Nothing in any template
  // rendered it -- verified by grep across the component and its HTML -- so it was
  // dead fixture data. Real sponsorship figures now come from
  // GET /api/sponsorships/summary.

  isAuthorizedUser = false;
  isPreviewModalOpen = false;
  isSuccessModalOpen = false;
  isSubmitting = false;

  selectedFileIds: { [key: string]: string[] } = {};
  selectedFileNames: { [key: string]: string[] } = {};
  schoolLogoUrl: string | null = null;
  judgeLogoUrl: string | null = null;
  sponsorLogoUrl: string | null = null;
  studentPhotoUrl: string | null = null;
  groupPhotoUrl: string | null = null;
  groupLogoUrl: string | null = null;
  memberPhotoUrls: Record<string, string | null> = { lead: null, m2: null, m3: null, m4: null, m5: null };
  missingDocsError = '';

  get hasRequiredDocs(): boolean {
    if (this.activeTab === 'school') {
      return !!(this.selectedFileIds['accredDocs']?.length);
    }
    if (this.activeTab === 'instructor') {
      return !!(this.selectedFileIds['instructorDocs']?.length);
    }
    return true;
  }

  sponsorshipItems = [
    { label: 'Team Sponsorship', icon: 'groups', desc: 'Sponsor a competition team' },
    { label: 'Student Sponsorship', icon: 'school', desc: 'Sponsor an individual student' },
    { label: 'Track Sponsorship', icon: 'category', desc: 'Sponsor an entire competition track' },
    { label: 'Mentorship Program', icon: 'psychology', desc: 'Fund a mentor session' },
    { label: 'Equipment & Tools', icon: 'construction', desc: 'Provide hardware / software' },
    { label: 'Prize & Awards', icon: 'emoji_events', desc: 'Fund championship prizes' }
  ];

  selectedPackages: string[] = [];

  togglePackage(label: string): void {
    if (this.selectedPackages.includes(label)) {
      this.selectedPackages = this.selectedPackages.filter(l => l !== label);
    } else {
      this.selectedPackages = [...this.selectedPackages, label];
    }
    this.sponsorForm.package = this.selectedPackages.join(', ');
  }

  isPackageSelected(label: string): boolean {
    return this.selectedPackages.includes(label);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'rgba(0, 63, 135, 0.08)';
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
  }

  onDropFile(event: DragEvent, field: string): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.processFiles(files, field);
    }
  }

  private async processFiles(files: FileList, field: string): Promise<void> {
    const sizeLimits: Record<string, number> = {
      schoolLogo: 5 * 1024 * 1024,
      accredDocs: 10 * 1024 * 1024,
      instructorDocs: 10 * 1024 * 1024,
      sponsorLogo: 3 * 1024 * 1024,
      judgeLogo: 3 * 1024 * 1024,
      studentPhoto: 10 * 1024 * 1024,
      groupPhoto: 10 * 1024 * 1024,
      groupLogo: 10 * 1024 * 1024,
      memberLeadPhoto: 10 * 1024 * 1024,
      member2Photo: 10 * 1024 * 1024,
      member3Photo: 10 * 1024 * 1024,
      member4Photo: 10 * 1024 * 1024,
      member5Photo: 10 * 1024 * 1024,
      openRegPhoto: 2 * 1024 * 1024,
      openRegDocs: 5 * 1024 * 1024
    };
    const maxSize = sizeLimits[field] || 10 * 1024 * 1024;
    const ids: string[] = [];
    const names: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        console.warn(`[FileUpload] "${file.name}" size=${file.size} bytes (${(file.size / 1024).toFixed(1)} KB), limit=${maxSize} bytes (${Math.round(maxSize / (1024 * 1024))} MB)`);
        this.dialogService.toast(`"${file.name}" exceeds the maximum size of ${Math.round(maxSize / (1024 * 1024))}MB.`, 'warning');
        continue;
      }
      const id = this.fileStorage.generateId();
      await this.fileStorage.store(id, file);
      ids.push(id);
      names.push(file.name);
    }
    if (ids.length) {
      this.selectedFileIds[field] = [...(this.selectedFileIds[field] || []), ...ids];
      this.selectedFileNames[field] = [...(this.selectedFileNames[field] || []), ...names];
    }
    this.missingDocsError = '';

    if (field === 'schoolLogo') {
      this.loadSchoolLogo();
    } else if (field === 'judgeLogo') {
      this.loadJudgeLogo();
    } else if (field === 'sponsorLogo') {
      this.loadSponsorLogo();
    } else if (field === 'studentPhoto') {
      this.loadStudentPhoto();
    } else if (field === 'groupPhoto') {
      this.loadGroupPhoto();
    } else if (field === 'groupLogo') {
      this.loadGroupLogo();
    } else if (field.startsWith('member') && field.endsWith('Photo')) {
      this.loadMemberPhoto(field);
    } else if (field === 'openRegPhoto') {
      this.loadOpenRegPhoto();
    } else if (field === 'openRegDocs') {
      this.loadOpenRegDoc();
    }
  }

  async onFileSelected(event: any, field: string): Promise<void> {
    const files: FileList = event.target.files;
    if (files?.length) {
      const sizeLimits: Record<string, number> = {
        schoolLogo: 5 * 1024 * 1024,
        accredDocs: 10 * 1024 * 1024,
        instructorDocs: 10 * 1024 * 1024,
        sponsorLogo: 3 * 1024 * 1024,
        judgeLogo: 3 * 1024 * 1024,
        studentPhoto: 10 * 1024 * 1024,
        groupPhoto: 10 * 1024 * 1024,
        groupLogo: 10 * 1024 * 1024,
        memberLeadPhoto: 10 * 1024 * 1024,
        member2Photo: 10 * 1024 * 1024,
        member3Photo: 10 * 1024 * 1024,
        member4Photo: 10 * 1024 * 1024,
        member5Photo: 10 * 1024 * 1024
      };
      const maxSize = sizeLimits[field] || 10 * 1024 * 1024;
      const ids: string[] = [];
      const names: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > maxSize) {
          console.warn(`[FileUpload] "${file.name}" size=${file.size} bytes (${(file.size / 1024).toFixed(1)} KB), limit=${maxSize} bytes (${Math.round(maxSize / (1024 * 1024))} MB)`);
          this.dialogService.toast(`"${file.name}" exceeds the maximum size of ${Math.round(maxSize / (1024 * 1024))}MB.`, 'warning');
          continue;
        }
        const id = this.fileStorage.generateId();
        await this.fileStorage.store(id, file);
        ids.push(id);
        names.push(file.name);
      }
      if (ids.length) {
        this.selectedFileIds[field] = [...(this.selectedFileIds[field] || []), ...ids];
        this.selectedFileNames[field] = [...(this.selectedFileNames[field] || []), ...names];
      }
      this.missingDocsError = '';

      if (field === 'schoolLogo') {
        this.loadSchoolLogo();
      } else if (field === 'judgeLogo') {
        this.loadJudgeLogo();
      } else if (field === 'sponsorLogo') {
        this.loadSponsorLogo();
      } else if (field === 'studentPhoto') {
        this.loadStudentPhoto();
      } else if (field === 'groupPhoto') {
        this.loadGroupPhoto();
      } else if (field === 'groupLogo') {
        this.loadGroupLogo();
      } else if (field.startsWith('member') && field.endsWith('Photo')) {
        this.loadMemberPhoto(field);
      }
    }
    event.target.value = '';
  }

  private async loadSchoolLogo(): Promise<void> {
    const id = this.selectedFileIds['schoolLogo']?.[0];
    if (id) {
      this.schoolLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadJudgeLogo(): Promise<void> {
    const id = this.selectedFileIds['judgeLogo']?.[0];
    if (id) {
      this.judgeLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadSponsorLogo(): Promise<void> {
    const id = this.selectedFileIds['sponsorLogo']?.[0];
    if (id) {
      this.sponsorLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadStudentPhoto(): Promise<void> {
    const id = this.selectedFileIds['studentPhoto']?.[0];
    if (id) {
      this.studentPhotoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadGroupPhoto(): Promise<void> {
    const id = this.selectedFileIds['groupPhoto']?.[0];
    if (id) {
      this.groupPhotoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadGroupLogo(): Promise<void> {
    const id = this.selectedFileIds['groupLogo']?.[0];
    if (id) {
      this.groupLogoUrl = await this.fileStorage.getUrl(id);
    }
  }

  private async loadMemberPhoto(field: string): Promise<void> {
    const id = this.selectedFileIds[field]?.[0];
    if (id) {
      const memberKeyMap: Record<string, string> = { memberLeadPhoto: 'lead', member2Photo: 'm2', member3Photo: 'm3', member4Photo: 'm4', member5Photo: 'm5' };
      const key = memberKeyMap[field] || 'lead';
      this.memberPhotoUrls[key] = await this.fileStorage.getUrl(id);
    }
  }

  async removeFile(field: string, index: number): Promise<void> {
    const id = this.selectedFileIds[field]?.[index];
    if (id) await this.fileStorage.remove(id);
    this.selectedFileIds[field]?.splice(index, 1);
    this.selectedFileNames[field]?.splice(index, 1);
    if (field === 'schoolLogo') {
      if (this.schoolLogoUrl) { this.fileStorage.revokeUrl(this.schoolLogoUrl); }
      this.schoolLogoUrl = null;
    } else if (field === 'judgeLogo') {
      if (this.judgeLogoUrl) { this.fileStorage.revokeUrl(this.judgeLogoUrl); }
      this.judgeLogoUrl = null;
    } else if (field === 'sponsorLogo') {
      if (this.sponsorLogoUrl) { this.fileStorage.revokeUrl(this.sponsorLogoUrl); }
      this.sponsorLogoUrl = null;
    } else if (field === 'studentPhoto') {
      if (this.studentPhotoUrl) { this.fileStorage.revokeUrl(this.studentPhotoUrl); }
      this.studentPhotoUrl = null;
    } else if (field === 'groupPhoto') {
      if (this.groupPhotoUrl) { this.fileStorage.revokeUrl(this.groupPhotoUrl); }
    this.groupPhotoUrl = null;
    this.groupLogoUrl = null;
    } else if (field === 'groupLogo') {
      if (this.groupLogoUrl) { this.fileStorage.revokeUrl(this.groupLogoUrl); }
      this.groupLogoUrl = null;
    } else if (field.startsWith('member') && field.endsWith('Photo')) {
      const removeKeyMap: Record<string, string> = { memberLeadPhoto: 'lead', member2Photo: 'm2', member3Photo: 'm3', member4Photo: 'm4', member5Photo: 'm5' };
      const key = removeKeyMap[field] || 'lead';
      if (this.memberPhotoUrls[key]) { this.fileStorage.revokeUrl(this.memberPhotoUrls[key]!); }
      this.memberPhotoUrls[key] = null;
    }
  }

  // Terms & Conditions
  acceptedTerms: { [key: string]: boolean } = {
    school: false,
    instructor: false,
    judge: false,
    sponsor: false,
    student: false
  };
  showTermsModal = false;
  showPrivacyModal = false;
  pendingTermsAction: string | null = null;

  openTermsModal(action: string): void {
    this.pendingTermsAction = action;
    this.showTermsModal = true;
  }

  closeTermsModal(): void {
    this.showTermsModal = false;
    this.pendingTermsAction = null;
  }

  acceptTerms(): void {
    if (this.pendingTermsAction) {
      this.acceptedTerms[this.pendingTermsAction] = true;
      switch (this.pendingTermsAction) {
        case 'school': this.schoolForm.acceptedTerms = true; break;
        case 'instructor': this.instructorForm.acceptedTerms = true; break;
        case 'judge': this.judgeForm.acceptedTerms = true; break;
        case 'sponsor': this.sponsorForm.acceptedTerms = true; break;
      }
    }
    this.closeTermsModal();
  }

  openPrivacyModal(): void {
    this.showPrivacyModal = true;
  }

  closePrivacyModal(): void {
    this.showPrivacyModal = false;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public themeService: ThemeService,
    public contentService: ContentService,
    public fileStorage: FileStorageService,
    private emailService: BrevoEmailService,
    private smsService: SmsService,
    private notificationService: NotificationService,
    public dialogService: DialogService,
    private apiService: ApiService,
    private otpService: OtpService,
    private cdr: ChangeDetectorRef
  ) {}

  logoUrls: Record<string, string> = {};

  async loadLogo(fileId: string): Promise<string> {
    if (this.logoUrls[fileId]) return this.logoUrls[fileId];
    const url = await this.fileStorage.getUrl(fileId);
    if (url) { this.logoUrls[fileId] = url; return url; }
    return '';
  }

  isLoginModalOpen = false;
  loginEmail = '';
  loginPassword = '';
  isLoggingIn = false;
  loginError = '';
  isPasswordVisible = false;
  rememberDevice = false;

  /** Forgot-password popup. The flow itself lives in ForgotPasswordComponent. */
  showForgotPassword = false;

  openForgotPassword(): void {
    this.loginError = '';
    this.showForgotPassword = true;
  }

  closeForgotPassword(): void {
    this.showForgotPassword = false;
  }

  onPasswordReset(email: string): void {
    this.showForgotPassword = false;
    // Pre-fill sign-in so the user only types their new password.
    this.loginEmail = email;
    this.loginPassword = '';
    this.loginError = 'Password reset. Sign in with your new password.';
  }

  openLoginModal(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isLoginModalOpen = true;
    this.loginError = '';
    const creds = getRememberedCredentials();
    if (creds.remembered) {
      this.rememberDevice = true;
      this.loginEmail = creds.username;
      // Passwords are never persisted - the user always retypes it.
      this.loginPassword = '';
    } else {
      this.loginEmail = '';
      this.loginPassword = '';
      this.rememberDevice = false;
    }
  }

  closeLoginModal(): void {
    this.isLoginModalOpen = false;
    this.loginEmail = '';
    this.loginPassword = '';
    this.loginError = '';
    this.closeForgotPassword();
  }

  get hasSavedCredentials(): boolean {
    return hasRememberedDevice();
  }

  clearSavedCredentials(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    forgetRememberedCredentials();
    this.loginEmail = '';
    this.loginPassword = '';
    this.rememberDevice = false;
    this.dialogService.toast('Saved credentials cleared from this device.', 'info');
  }

  performLogin(): void {
    if (!this.loginEmail.trim()) {
      this.loginError = 'Please enter your email or access pass.';
      return;
    }

    const upperCred = this.loginEmail.trim().toUpperCase();
    if (upperCred.startsWith('NTIC-STU-20') || upperCred.startsWith('NTIC-TM-20') || upperCred.startsWith('NTIC-SCH-20') || upperCred.startsWith('NTIC-INS-20') || upperCred.startsWith('NTIC-OPEN-20')) {
      this.loginError = 'This is an Application Tracking Code. Applications under review cannot log in yet. Go to "Track / Edit Submitted Application" to check your status or wait for admin approval.';
      return;
    }

    this.isLoggingIn = true;
    this.loginError = '';

    const credential = this.loginEmail.trim().toLowerCase();
    const pass = this.loginPassword.trim();

    this.apiService.login(credential, pass).subscribe({
      next: (res) => this.completeLogin(res.role, res, credential),
      error: (err) => {
        if (err.status === 0 || err.status === 502 || err.status === 503 || err.name === 'TimeoutError') {
          this.isLoggingIn = false;
          this.loginError = 'Server unreachable. Please try again once the server is online.';
        } else if (err.status === 401) {
          this.isLoggingIn = false;
          this.loginError = 'Incorrect email or password. Please try again.';
        } else {
          this.isLoggingIn = false;
          this.loginError = 'Login is unavailable right now. Please try again later.';
        }
      }
    });
  }

  private completeLogin(role: string, user: any, credential: string): void {
    this.isLoggingIn = false;
    const email = user.email || credential;
    const ticket = user.ticket || credential;

    setAuthValue('activeRoleId', role);
    setAuthValue('activeUserEmail', email);
    setAuthValue('activeUserTicket', ticket);
    // POST /api/login returns snake_case `full_name`, so `user.fullName` was
    // always undefined here and activeUserName was never set. See the matching
    // fix in landing.component.ts.
    const resolvedName = user.full_name || user.fullName;
    if (resolvedName) {
      setAuthValue('activeUserName', resolvedName);
    }
    if (user.token) {
      setAuthValue('activeUserToken', user.token);
    }

    // Save or clear remembered credentials without auto-logging in
    saveRememberedCredentials(credential, this.loginPassword.trim(), this.rememberDevice);
    this.contentService.saveAuditLogs([
      { action: `${role} login: ${email}`, user: email, time: new Date().toISOString(), type: 'auth' },
      ...this.contentService.auditLogs
    ]);

    const roleRoutes: Record<string, string> = {
      instructor: '/instructor',
      judge: '/dashboard',
      student: '/lms',
      school_admin: '/dashboard',
      sponsor: '/sponsors',
      super_admin: '/dashboard',
      content_manager: '/dashboard',
      reviewer: '/dashboard',
      competition_manager: '/dashboard'
    };

    this.isLoginModalOpen = false;
    if ((role === 'judge' || role === 'sponsor') && (user.organization === '_pending_profile' || user.organization === '')) {
      this.router.navigate(['/profile-completion']);
    } else {
      this.router.navigate([roleRoutes[role] || '/dashboard']);
    }
  }

  getLogoUrl(details: any): string {
    if (details?.logoFileId && this.logoUrls[details.logoFileId]) return this.logoUrls[details.logoFileId];
    return '';
  }

  ngOnInit(): void {
    this.purgeExpiredDrafts();
    const activeRoleId = getAuthValue('activeRoleId');
    this.isAuthorizedUser = !!(activeRoleId && ['super_admin', 'school_admin', 'instructor'].includes(activeRoleId));

    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      this.showAdminPaths = params['admin'] === 'true';
      const sectionParam = params['section'];
      const tabParam = params['tab'];
      const codeParam = params['code'] || params['q'];
      const stepParam = params['step'];

      if (sectionParam === 'tracker' || params['track_app']) {
        this.regState = 'tracker';
        if (codeParam) {
          this.trackerQuery = codeParam;
          this.searchApplication();
        }
      } else if (sectionParam === 'continue') {
        this.regState = 'continue_select';
      } else if (params['track']) {
        this.selectedTrack = params['track'];
        this.regState = 'gateway';
        this.isPathModalOpen = true; // Open Select Registration Path popup immediately
      } else if (tabParam || sectionParam === 'new') {
        if (tabParam) {
          this.activeTab = tabParam;
        }
        this.regState = 'new';
        if (stepParam) {
          const stepNum = parseInt(stepParam, 10);
          if (!isNaN(stepNum) && stepNum >= 1 && stepNum <= 4) {
            this.schoolStep = stepNum;
            this.syncCardSubTab(stepNum);
          }
        }
      } else {
        // Clean navigation without query params -> ALWAYS default to Championship Entry Gateway
        this.clearRegState();
        this.regState = 'gateway';
      }
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();

    // clearTimer() only clears resendInterval. verifyOtpTimer is cleared at
    // every normal exit from the OTP flow, but not when the user navigates
    // away mid-countdown -- so it kept ticking after the component was gone.
    // zone.js patches setInterval, so each orphaned tick ran a full app-wide
    // change detection pass, once per second, forever, and another one was
    // added every time the page was revisited.
    if (this.verifyOtpTimer) {
      clearInterval(this.verifyOtpTimer);
      this.verifyOtpTimer = null;
    }

    // route.queryParams never completes, so this subscription outlived the
    // component and kept the whole class instance (and its template state)
    // reachable, re-running the handler on later navigations.
    this.queryParamsSub?.unsubscribe();
  }

  selectNewRegistration(): void {
    this.isPathModalOpen = true;
    this.clearDraftPrefills();
  }

  selectContinueRegistration(): void {
    this.regState = 'continue_select';
    this.verificationInput = '';
    this.otpCode = '';
    this.otpError = '';
    this.saveRegState();
  }

  openTracker(): void {
    this.regState = 'tracker';
    this.trackerQuery = '';
    this.trackerResult = null;
    this.trackerStatus = 'idle';
    this.trackerSearched = false;
    this.saveRegState();
  }

  generateApplicationCode(type: 'school' | 'team' | 'instructor' | 'student'): string {
    const prefix = type === 'school' ? 'SCH' : type === 'team' ? 'TM' : type === 'student' ? 'STU' : 'INS';
    const year = new Date().getFullYear();
    return `NTIC-${prefix}-${year}-${this.randomSuffix(4)}`;
  }

  /**
   * Short random code for display tickets and application codes, using
   * crypto.getRandomValues rather than Math.random().
   *
   * This is NOT a password. Account passwords are generated server-side and
   * returned once as `temporary_password` from POST /api/users.
   */
  private randomSuffix(length = 6): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  copyApplicationCode(): void {
    if (!this.lastApplicationCode) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(this.lastApplicationCode).then(() => {
        this.copiedApplicationCode = true;
        setTimeout(() => this.copiedApplicationCode = false, 2000);
      }).catch(() => this.fallbackCopy(this.lastApplicationCode!));
    } else {
      this.fallbackCopy(this.lastApplicationCode);
    }
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    this.copiedApplicationCode = true;
    setTimeout(() => this.copiedApplicationCode = false, 2000);
  }

  searchApplication(): void {
    const q = this.trackerQuery.trim();
    if (!q) return;
    const localResult = this.contentService.lookupApplication(q);
    if (localResult && localResult.status !== 'not_found') {
      this.trackerResult = localResult;
      this.trackerStatus = localResult.status;
      this.trackerSearched = true;
      this.saveRegState();
      return;
    }
    // Query server if not found in local memory
    this.apiService.getPublicApprovalStatus(q).subscribe({
      next: (serverResult: any) => {
        if (serverResult && serverResult.status && serverResult.status !== 'not_found') {
          this.trackerResult = serverResult;
          this.trackerStatus = serverResult.status;
        } else {
          this.trackerResult = { status: 'not_found' };
          this.trackerStatus = 'not_found';
        }
        this.trackerSearched = true;
        this.saveRegState();
      },
      error: () => {
        this.trackerResult = { status: 'not_found' };
        this.trackerStatus = 'not_found';
        this.trackerSearched = true;
        this.saveRegState();
      }
    });
  }

  startEditApplication(): void {
    const app = this.trackerResult?.application;
    if (!app) return;
    this.editingApprovalId = app.id;
    this.justUpdatedApplication = false;
    this.loadApprovalIntoForm(app);
    this.regState = 'new';
    this.isDraftResumed = false;
    this.saveRegState();
  }

  private loadApprovalIntoForm(app: any): void {
    const d = app.details || {};
    this.clearDraftPrefills();
    if (app.type === 'School Registration') {
      this.activeTab = 'school';
      this.schoolForm = {
        name: app.entity || '',
        category: d.category || 'Public High School',
        region: d.region || 'Greater Accra',
        district: d.district || '',
        tel: d.phone || '',
        email: d.email || '',
        gps: d.gps || '',
        repName: d.repName || '',
        repEmail: d.repEmail || '',
        repTel: d.repTel || '',
        students: d.students || [],
        teams: d.teamsList || [],
        acceptedTerms: true,
        gdpaConsent: d.gdpaConsent ?? true,
        gdpaConsentTimestamp: d.gdpaConsentTimestamp || ''
      };
      this.gpsAddress = d.gpsAddress || '';
      this.schoolStep = 1;
      this.maxSchoolStepReached = 4;
      if (d.docs?.length) {
        this.selectedFileIds['accredDocs'] = d.docs.map((x: string) => x.split('::')[0]);
        this.selectedFileNames['accredDocs'] = d.docs.map((x: string) => x.split('::')[1] || 'document.pdf');
      }
      if (d.logoFileId) {
        this.selectedFileIds['schoolLogo'] = [d.logoFileId];
        this.selectedFileNames['schoolLogo'] = ['School Logo'];
        this.loadSchoolLogo();
      }
    } else if (app.type === 'Team Addition') {
      this.activeTab = 'student';
      this.competitorMode = 'group';
      const members = d.members || [];
      this.teamForm = {
        name: app.entity || '',
        school: d.school || '',
        region: d.region || 'Greater Accra',
        track: d.track || '',
        leadName: members[0] || '',
        leadEmail: app.contact || '',
        member2Name: members[1] || '',
        member2Email: '',
        member3Name: members[2] || '',
        member3Email: '',
        member4Name: members[3] || '',
        member4Email: '',
        member5Name: members[4] || '',
        member5Email: '',
        skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
      };
    } else if (app.type === 'Student Registration') {
      this.activeTab = 'student';
      this.competitorMode = 'individual';
      this.selectedTrack = d.track || '';
      this.studentForm = {
        name: app.entity || '',
        id: d.id || '',
        email: app.contact || '',
        dob: d.dob || '',
        gender: d.gender || '',
        school: d.school || '',
        class: d.class || '',
        guardianName: d.guardianName || '',
        guardianPhone: d.guardianPhone || '',
        region: d.region || 'Greater Accra',
        track: d.track || '',
        skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
      };
      if (d.photoFileId) {
        this.selectedFileIds['studentPhoto'] = [d.photoFileId];
        this.selectedFileNames['studentPhoto'] = ['Student Photo'];
        this.loadStudentPhoto();
      }
    } else if (app.type === 'Instructor Access') {
      this.activeTab = 'instructor';
      const expertiseMap: Record<string, boolean> = { Python: false, JavaScript: false, 'C#': false, AI: false, Robotics: false, 'Networking & Cybersecurity': false, 'Data Science': false };
      (d.specialization || '').split(',').forEach((s: string) => {
        const k = s.trim();
        if (k in expertiseMap) expertiseMap[k] = true;
      });
      this.instructorForm = {
        name: app.entity || '',
        tel: d.phone || '',
        email: app.contact || '',
        address: d.address || '',
        region: d.region || 'Greater Accra',
        qualification: d.credentials || 'BSc',
        institution: d.institution === 'Independent Mentor' ? '' : (d.institution || ''),
        isIndependent: !!d.isIndependent,
        acceptedTerms: true,
        portfolio: d.portfolio || '',
        expertise: expertiseMap
      };
      if (d.docs?.length) {
        this.selectedFileIds['instructorDocs'] = d.docs.map((x: string) => x.split('::')[0]);
        this.selectedFileNames['instructorDocs'] = d.docs.map((x: string) => x.split('::')[1] || 'document.pdf');
      }
    } else if (app.type === 'Judge Registration' || app.type === 'Judge') {
      this.activeTab = 'judge';
      this.judgeForm = {
        name: app.entity || '',
        tel: d.phone || '',
        email: app.contact || '',
        organization: d.organization || '',
        region: d.region || 'Greater Accra',
        expertise: d.expertise || '',
        experience: d.experience || '',
        bio: d.bio || '',
        ticketCode: d.code || '',
        otp: '',
        acceptedTerms: true
      };
      if (d.logoFileId) {
        this.selectedFileIds['judgeLogo'] = [d.logoFileId];
        this.selectedFileNames['judgeLogo'] = ['Judge Logo'];
      }
    } else if (app.type === 'Sponsor Registration' || app.type === 'Sponsor') {
      this.activeTab = 'sponsor';
      this.sponsorForm = {
        name: app.entity || '',
        sector: d.sector || 'Energy & Mining',
        repName: d.repName || '',
        repContact: d.phone || d.repContact || '',
        email: app.contact || d.email || '',
        region: d.region || 'Greater Accra',
        package: d.package || '',
        acceptedTerms: true,
        arenas: d.arenas || {
          'Coding Track': true,
          'Robotics Arena': true,
          'AI & ML Challenge': true,
          'Cyber Security CTF': true,
          'Open Innovation': true
        }
      };
    } else if (app.type === 'Open Registration' || app.type === 'Open') {
      this.activeTab = 'open';
      this.openRegForm = {
        fullName: app.entity || '',
        email: app.contact || '',
        phone: d.phone || '',
        ageGroup: d.ageGroup || 'junior',
        experienceLevel: d.experienceLevel || 'beginner',
        organization: d.organization || '',
        selectedCompetitionId: d.competitionId || '',
        acceptedTerms: true,
        emailVerified: true,
        phoneVerified: !!d.phone
      };
    }
  }

  goBackToGatewayFromTracker(): void {
    this.regState = 'gateway';
    this.clearRegState();
    this.trackerQuery = '';
    this.trackerResult = null;
    this.trackerStatus = 'idle';
    this.trackerSearched = false;
    this.editingApprovalId = null;
  }

  goBackToGateway(): void {
    this.isPathModalOpen = false;
    this.regState = 'gateway';
    this.clearRegState();
    this.clearTimer();
    this.editingApprovalId = null;
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

    const rawInput = this.verificationInput.trim();
    const inputKey = rawInput.toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    const draftKey = this.resolveDraftKey(drafts, rawInput, inputKey);

    if (!draftKey) {
      this.otpError = 'No saved draft found for this ' + this.verificationMethod + '. Please check and try again, or start a new registration.';
      return;
    }

    // Codes are minted and checked by the server. The draft owner's email is
    // always the delivery target, so someone who guesses another person's email
    // still cannot read the code.
    this.otpError = '';
    this.otpCode = '';
    this.otpBusy = true;
    this.resumeDraftKey = draftKey;

    this.otpService.request('draft_resume', 'email', draftKey).subscribe({
      next: challenge => {
        this.otpChallengeId = challenge.challengeId;
        this.otpBusy = false;
        this.regState = 'otp_verification';
        this.startResendTimer();
        this.showCustomAlert(
          `A 6-digit verification code has been sent to ${challenge.targetMasked}.`,
          'Verification Code Sent', 'info'
        );
        this.cdr?.markForCheck?.();
      },
      error: (err: Error) => {
        this.otpBusy = false;
        this.otpError = err.message;
        this.cdr?.markForCheck?.();
      }
    });
  }

  private resolveDraftKey(drafts: Record<string, any>, rawInput: string, inputKey: string): string | null {
    if (drafts[inputKey]) return inputKey;
    const needle = rawInput.replace(/\s+/g, '').toLowerCase();
    if (!needle) return null;
    for (const key of Object.keys(drafts)) {
      const data = drafts[key]?.data;
      if (data && typeof data === 'object' && JSON.stringify(data).replace(/\s+/g, '').toLowerCase().includes(needle)) {
        return key;
      }
    }
    return null;
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
    if (!this.resumeDraftKey) {
      this.otpError = 'No verification in progress. Please start again.';
      return;
    }
    this.otpCode = '';
    this.otpError = '';
    this.otpBusy = true;

    // Requesting a new code retires the previous challenge server-side.
    this.otpService.request('draft_resume', 'email', this.resumeDraftKey).subscribe({
      next: challenge => {
        this.otpChallengeId = challenge.challengeId;
        this.otpBusy = false;
        this.showCustomAlert('New verification code sent.', 'Code Resent', 'info');
        this.startResendTimer();
        this.cdr?.markForCheck?.();
      },
      error: (err: Error) => {
        this.otpBusy = false;
        this.otpError = err.message;
        this.cdr?.markForCheck?.();
      }
    });
  }

  verifyOTP(): void {
    if (this.otpCode.length !== 6) {
      this.otpError = 'Please enter the complete 6-digit code.';
      return;
    }
    if (!this.otpChallengeId) {
      this.otpError = 'No verification code found. Please request a new one.';
      return;
    }

    this.otpError = '';
    this.otpBusy = true;

    this.otpService.verify(this.otpChallengeId, this.otpCode).subscribe({
      next: result => {
        this.otpBusy = false;
        this.otpChallengeId = '';
        this.regState = 'resume_success';
        this.clearTimer();
        // Trust the server's notion of which contact was verified rather than
        // anything held in the browser.
        const verifiedContact = result.target || this.resumeDraftKey;
        // Required to read the draft: proves we received the emailed code.
        this.resumeToken = result.resume_token || '';
        setTimeout(() => {
          this.applyDraftPrefills(verifiedContact);
          this.regState = 'new';
          this.saveRegState();
        }, 2200);
        this.cdr?.markForCheck?.();
      },
      error: (err: Error) => {
        this.otpBusy = false;
        this.otpError = err.message;
        this.cdr?.markForCheck?.();
      }
    });
  }

  cardSubTab = 'profile'; // 'profile' | 'roster' | 'docs'

  goToStep(step: number): void {
    if (step <= this.maxSchoolStepReached) {
      this.schoolStep = step;
      this.syncCardSubTab(step);
      this.saveRegState();
    }
  }

  nextStep(step: number): void {
    if (this.schoolStep === 3 && step === 4 && !this.schoolForm.gdpaConsent) {
      this.notificationService.warning('Please check the Ghana Data Protection Act (Act 843) consent box to proceed.', 'Consent Required');
      return;
    }
    if (step === this.schoolStep + 1) {
      this.schoolStep = step;
      if (step > this.maxSchoolStepReached) {
        this.maxSchoolStepReached = step;
      }
      this.syncCardSubTab(step);
      this.saveRegState();
    }
  }

  syncCardSubTab(step: number): void {
    if (step === 3) {
      this.cardSubTab = 'roster';
    } else if (step === 4) {
      this.cardSubTab = 'docs';
    } else {
      this.cardSubTab = 'profile';
    }
  }

  addStudent(): void {
    if (!this.studentForm.name) {
      this.showCustomAlert('Please enter student name.', 'Validation Error', 'warning');
      return;
    }
    this.schoolForm.students.push({
      id: this.studentForm.id,
      name: this.studentForm.name,
      dob: this.studentForm.dob,
      gender: this.studentForm.gender,
      class: this.studentForm.class,
      guardianName: this.studentForm.guardianName,
      guardianPhone: this.studentForm.guardianPhone,
      track: this.selectedTrack,
      skills: { ...this.studentForm.skills }
    });
    this.studentForm.id = '';
    this.studentForm.name = '';
    this.studentForm.guardianName = '';
    this.studentForm.guardianPhone = '';
  }

  removeStudent(index: number): void {
    this.schoolForm.students.splice(index, 1);
  }

  addTeam(): void {
    if (!this.teamForm.name) {
      this.showCustomAlert('Please enter team name.', 'Validation Error', 'warning');
      return;
    }
    const memberPhotoIds: string[] = [];
    ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
      const id = this.selectedFileIds[k]?.[0];
      if (id) memberPhotoIds.push(id);
    });
    const rosterList = [
      this.teamForm.leadName,
      this.teamForm.member2Name,
      this.teamForm.member3Name,
      this.teamForm.member4Name,
      this.teamForm.member5Name
    ].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);

    this.schoolForm.teams.push({
      name: this.teamForm.name,
      track: this.teamForm.track,
      leadName: this.teamForm.leadName,
      leadEmail: this.teamForm.leadEmail,
      member2Name: this.teamForm.member2Name,
      member2Email: this.teamForm.member2Email,
      member3Name: this.teamForm.member3Name,
      member3Email: this.teamForm.member3Email,
      member4Name: this.teamForm.member4Name,
      member4Email: this.teamForm.member4Email,
      member5Name: this.teamForm.member5Name,
      member5Email: this.teamForm.member5Email,
      rosterList,
      members: rosterList,
      memberPhotos: memberPhotoIds.length ? memberPhotoIds : undefined
    });
    this.teamForm.name = '';
    this.teamForm.school = '';
    this.teamForm.leadName = '';
    this.teamForm.leadEmail = '';
    this.teamForm.member2Name = '';
    this.teamForm.member2Email = '';
    this.teamForm.member3Name = '';
    this.teamForm.member3Email = '';
    this.teamForm.member4Name = '';
    this.teamForm.member4Email = '';
    this.teamForm.member5Name = '';
    this.teamForm.member5Email = '';
    // Clear member photos
    ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
      const id = this.selectedFileIds[k]?.[0];
      if (id) { this.fileStorage.remove(id); }
    });
    const urlKeys = ['lead', 'm2', 'm3', 'm4', 'm5'];
    urlKeys.forEach(k => { if (this.memberPhotoUrls[k]) { this.fileStorage.revokeUrl(this.memberPhotoUrls[k]!); } });
    this.selectedFileIds['memberLeadPhoto'] = [];
    this.selectedFileIds['member2Photo'] = [];
    this.selectedFileIds['member3Photo'] = [];
    this.selectedFileIds['member4Photo'] = [];
    this.selectedFileIds['member5Photo'] = [];
    this.selectedFileNames['memberLeadPhoto'] = [];
    this.selectedFileNames['member2Photo'] = [];
    this.selectedFileNames['member3Photo'] = [];
    this.selectedFileNames['member4Photo'] = [];
    this.selectedFileNames['member5Photo'] = [];
    this.memberPhotoUrls = { lead: null, m2: null, m3: null, m4: null, m5: null };
  }

  removeTeam(index: number): void {
    this.schoolForm.teams.splice(index, 1);
  }

  competitorMode: 'individual' | 'group' = 'group';

  async registerStudent(): Promise<void> {
    if (this.competitorMode === 'group') {
      if (!this.teamForm.name || !this.teamForm.leadName) {
        this.showCustomAlert('Please enter your Group / Team Name and Team Lead full name.', 'Missing Information', 'warning');
        return;
      }
      // Validate all provided emails
      const teamEmails = [this.teamForm.leadEmail, this.teamForm.member2Email, this.teamForm.member3Email, this.teamForm.member4Email, this.teamForm.member5Email].filter(e => e?.trim());
      const lowerEmails = teamEmails.map(e => e!.trim().toLowerCase());
      const dupEmail = lowerEmails.find((e, i) => lowerEmails.indexOf(e) !== i);
      if (dupEmail) {
        this.showCustomAlert(`The email "${dupEmail}" is used multiple times in this form. Each team member must have a unique email.`, 'Duplicate Email', 'warning');
        return;
      }
      for (const email of teamEmails) {
        if (!this.contentService.isValidEmail(email!)) {
          this.showCustomAlert('One or more team emails have invalid format. Please check.', 'Invalid Email', 'warning');
          return;
        }
        if (!this.editingApprovalId) {
          try {
            const avail = await firstValueFrom(this.apiService.checkAvailability(email!.trim(), ''));
            if (avail && avail.email_taken) {
              this.showCustomAlert(`The email "${email}" is already registered in the system. Please use a different email.`, 'Email Taken', 'warning');
              return;
            }
          } catch {
            if (this.contentService.isEmailTaken(email!, this.editingApprovalId || undefined)) {
              this.showCustomAlert(`The email "${email}" is already registered. Please use a different email.`, 'Email Taken', 'warning');
              return;
            }
          }
        }
      }
      const ticket = `NTIC-GRP-${this.randomSuffix()}`;
      const leadEmail = this.teamForm.leadEmail?.trim() || `${ticket.toLowerCase()}@squad.ntic.gh`;

      if (this.editingApprovalId) {
        const rosterList = [this.teamForm.leadName, this.teamForm.member2Name, this.teamForm.member3Name, this.teamForm.member4Name, this.teamForm.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
        const currentApprovals = [...this.contentService.pendingApprovals];
        const idx = currentApprovals.findIndex(a => a.id === this.editingApprovalId);
        if (idx > -1) {
          currentApprovals[idx] = {
            ...currentApprovals[idx],
            type: 'Team Addition',
            entity: this.teamForm.name,
            contact: leadEmail,
            submitted: 'Updated ' + new Date().toLocaleString('en-GB'),
            details: {
              school: this.teamForm.school,
              region: this.teamForm.region,
              track: this.teamForm.track,
              project: this.teamForm.name + ' Sandbox Project',
              members: rosterList,
              memberEmails: [this.teamForm.leadEmail, this.teamForm.member2Email, this.teamForm.member3Email, this.teamForm.member4Email, this.teamForm.member5Email].filter(Boolean),
              leadEmail,
              coach: 'Instructor assigned by ' + (this.teamForm.school || 'Registered Institution'),
              code: currentApprovals[idx].details?.code || this.generateApplicationCode('team')
            }
          };
        this.contentService.saveApprovals(currentApprovals);

        // Also persist to backend so other machines and reviewers see updated approvals
        const updatedApproval = currentApprovals[idx];
        if (updatedApproval) {
          this.apiService.submitPublicApplication({
            type: updatedApproval.type,
            entity: updatedApproval.entity,
            contact: updatedApproval.contact,
            details: updatedApproval.details
          }).subscribe({ next: () => {}, error: (err: any) => console.warn('[Registration] Update error:', err) });
        }

          const currentAudit = [...this.contentService.auditLogs];
          currentAudit.unshift({
            action: `Application updated (Team Addition): ${this.teamForm.name}`,
            user: leadEmail,
            time: new Date().toISOString(),
            type: 'approval'
          });
          this.contentService.saveAuditLogs(currentAudit);

          this.justUpdatedApplication = true;
          this.editingApprovalId = null;
          this.lastApplicationCode = currentApprovals[idx].details?.code || null;
          this.copiedApplicationCode = false;
          this.isSuccessModalOpen = true;
          this.clearDraftPrefills();
        }
        return;
      }

      const membersList = [
        { name: this.teamForm.leadName, email: leadEmail, role: 'Lead' },
        ...(this.teamForm.member2Name ? [{ name: this.teamForm.member2Name, email: this.teamForm.member2Email, role: 'Member' }] : []),
        ...(this.teamForm.member3Name ? [{ name: this.teamForm.member3Name, email: this.teamForm.member3Email, role: 'Member' }] : []),
        ...(this.teamForm.member4Name ? [{ name: this.teamForm.member4Name, email: this.teamForm.member4Email, role: 'Member' }] : []),
        ...(this.teamForm.member5Name ? [{ name: this.teamForm.member5Name, email: this.teamForm.member5Email, role: 'Member' }] : [])
      ];

      const memberPhotoIds: string[] = [];
      ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
        const id = this.selectedFileIds[k]?.[0];
        if (id) memberPhotoIds.push(id);
      });

      const code = this.generateApplicationCode('team');
      const details: any = {
        school: this.teamForm.school || '',
        region: this.teamForm.region,
        track: this.teamForm.track || 'Coding',
        project: this.teamForm.name + ' Sandbox Project',
        members: membersList.map(m => m.name),
        memberEmails: membersList.map(m => m.email).filter(Boolean),
        leadEmail,
        coach: 'Instructor assigned by ' + (this.teamForm.school || 'Registered Institution'),
        code,
        photoFileId: this.selectedFileIds['groupPhoto']?.[0] || undefined,
        logoFileId: this.selectedFileIds['groupLogo']?.[0] || undefined,
        memberPhotos: memberPhotoIds.length ? memberPhotoIds : undefined,
        skills: { ...this.teamForm.skills }
      };

      const currentApprovals = [...this.contentService.pendingApprovals];
      currentApprovals.unshift({
        id: 'REQ-' + Date.now(),
        type: 'Team Addition',
        entity: this.teamForm.name,
        contact: leadEmail,
        submitted: 'Just now',
        details
      });
      this.contentService.saveApprovals(currentApprovals);

      // Real backend persist for reviewers
      this.apiService.submitPublicApplication({
        type: 'Team Addition',
        entity: this.teamForm.name,
        contact: leadEmail,
        details
      }).subscribe({
        next: () => {},
        error: (err: any) => console.warn('[Registration] Team submit error:', err)
      });

      if (leadEmail) {
        this.emailService.sendPendingConfirmation(leadEmail, this.teamForm.leadName, this.teamForm.name, 'Team Addition', code);
      }

      const currentAudit = [...this.contentService.auditLogs];
      currentAudit.unshift({
        action: `New Team Addition requested: ${this.teamForm.name}`,
        user: leadEmail,
        time: new Date().toISOString(),
        type: 'approval'
      });
      this.contentService.saveAuditLogs(currentAudit);

      this.justUpdatedApplication = false;
      this.editingApprovalId = null;
      this.lastApplicationCode = code;
      this.copiedApplicationCode = false;
      this.isSuccessModalOpen = true;
      this.clearDraftPrefills();
      return;
    }

    // Individual Competitor
    if (!this.studentForm.name) {
      this.showCustomAlert('Please enter your full name to register.', 'Validation Error', 'warning');
      return;
    }
    const ticket = `NTIC-STU-${this.randomSuffix()}`;
    const studentEmail = this.studentForm.email?.trim() || `${ticket.toLowerCase()}@stu.ntic.gh`;
    if (this.studentForm.email?.trim() && !this.editingApprovalId) {
      try {
        const avail = await firstValueFrom(this.apiService.checkAvailability(studentEmail, ''));
        if (avail && avail.email_taken) {
          this.showCustomAlert('An account or application with this email already exists in the system. Please log in instead.', 'Account Exists', 'warning');
          return;
        }
      } catch {
        if (this.contentService.isEmailTaken(studentEmail, this.editingApprovalId || undefined)) {
          this.showCustomAlert('An account with this email already exists. Please log in instead.', 'Account Exists', 'warning');
          return;
        }
      }
    }
    const code = this.editingApprovalId
      ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('student'))
      : this.generateApplicationCode('student');
    const details: any = {
      region: this.studentForm.region,
      school: this.studentForm.school || '',
      class: this.studentForm.class || '',
      dob: this.studentForm.dob || '',
      gender: this.studentForm.gender || '',
      guardianName: this.studentForm.guardianName || '',
      guardianPhone: this.studentForm.guardianPhone || '',
      track: this.selectedTrack || '',
      skills: { ...this.studentForm.skills },
      code
    };
    const photoFileId = this.selectedFileIds['studentPhoto']?.[0];
    if (photoFileId) details.photoFileId = photoFileId;

    const currentApprovals = [...this.contentService.pendingApprovals];
    if (this.editingApprovalId) {
      const idx = currentApprovals.findIndex(a => a.id === this.editingApprovalId);
      if (idx > -1) {
        currentApprovals[idx] = {
          ...currentApprovals[idx],
          type: 'Student Registration',
          entity: this.studentForm.name,
          contact: studentEmail,
          submitted: 'Updated ' + new Date().toLocaleString('en-GB'),
          details
        };
      } else {
        currentApprovals.unshift({
          id: 'REQ-' + Date.now(),
          type: 'Student Registration',
          entity: this.studentForm.name,
          contact: studentEmail,
          submitted: 'Just now',
          details
        });
      }
    } else {
      currentApprovals.unshift({
        id: 'REQ-' + Date.now(),
        type: 'Student Registration',
        entity: this.studentForm.name,
        contact: studentEmail,
        submitted: 'Just now',
        details
      });
    }
    this.contentService.saveApprovals(currentApprovals);

    // Real backend persist for reviewers
    this.apiService.submitPublicApplication({
      type: 'Student Registration',
      entity: this.studentForm.name,
      contact: studentEmail,
      details
    }).subscribe({
      next: () => {},
      error: (err: any) => console.warn('[Registration] Student submit error:', err)
    });

    if (studentEmail) {
      this.emailService.sendPendingConfirmation(studentEmail, this.studentForm.name, this.studentForm.name, 'Student Registration', code);
    }

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: this.editingApprovalId ? `Application updated (Student Registration): ${this.studentForm.name}` : `New Student Registration requested: ${this.studentForm.name}`,
      user: studentEmail,
      time: new Date().toISOString(),
      type: 'approval'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.justUpdatedApplication = !!this.editingApprovalId;
    this.editingApprovalId = null;
    this.lastApplicationCode = code;
    this.copiedApplicationCode = false;
    this.isSuccessModalOpen = true;
    this.clearDraftPrefills();
  }

  detectGps(): void {
    if (!navigator.geolocation) {
      this.schoolForm.gps = '5.6037, -0.1870';
      this.gpsAddress = 'Accra, Greater Accra, Ghana (fallback)';
      this.gpsAccuracyWarning = 'Geolocation not available -- location set to Accra. You can edit the coordinates manually.';
      return;
    }
    this.gpsLoading = true;
    this.gpsAddress = '';
    this.gpsAccuracyWarning = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.schoolForm.gps = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (pos.coords.accuracy > 1000) {
          this.gpsAccuracyWarning = `Low accuracy (~${Math.round(pos.coords.accuracy)}m). This may be based on WiFi/IP, not GPS. Edit the coordinates if incorrect.`;
        } else {
          this.gpsAccuracyWarning = '';
        }
        this.reverseGeocode(lat, lng);
      },
      () => {
        this.schoolForm.gps = '5.6037, -0.1870';
        this.gpsAddress = 'Accra, Greater Accra, Ghana (fallback)';
        this.gpsAccuracyWarning = 'Location detection failed -- set to Accra. You can edit the coordinates manually.';
        this.gpsLoading = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  clearSchoolGps(): void {
    this.schoolForm.gps = '';
    this.gpsAddress = '';
    this.gpsAccuracyWarning = '';
    this.notificationService.info('GPS coordinates cleared');
    this.tryAutoSave();
  }

  onGpsManualEdit(): void {
    this.gpsAccuracyWarning = '';
    if (!this.schoolForm.gps || !this.schoolForm.gps.trim()) {
      this.gpsAddress = '';
      return;
    }
    const match = this.schoolForm.gps.match(/([-\d.]+)\s*,\s*([-\d.]+)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        this.reverseGeocode(lat, lng);
      }
    }
  }

  private reverseGeocode(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      .then(res => res.json())
      .then((data: any) => {
        const a = data.address || {};
        const parts = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state || a.region, a.country].filter(Boolean);
        this.gpsAddress = parts.join(', ') || data.display_name || '';
        const detectedDistrict = a.county || a.state_district || a.district || '';
        if (detectedDistrict && !this.schoolForm.district) {
          this.schoolForm.district = detectedDistrict;
        }
        this.gpsLoading = false;
      })
      .catch(() => {
        this.gpsAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        this.gpsLoading = false;
      });
  }

  loadOpenCompetitions(): void {
    // Uses the shared lifecycle predicate rather than its own status list, so
    // this picker can never offer a cycle the API will refuse to register into.
    this.availableOpenCompetitions = this.contentService.getOpenCompetitions()
      .map(c => ({
        id: c.id,
        title: c.title,
        track: c.track,
        type: c.type,
        deadline: c.deadline,
        teams: c.teams,
        maxTeams: c.maxTeams,
        prize: c.prize,
        status: c.status
      }));
  }

  getSelectedCompetition(): any {
    return this.availableOpenCompetitions.find(c => c.id === this.openRegForm.selectedCompetitionId) || null;
  }

  sendOpenVerificationCode(): void {
    if (!this.openRegForm.email) return;
    if (!this.contentService.isValidEmail(this.openRegForm.email)) {
      this.dialogService.toast('Please enter a valid email address.', 'error');
      return;
    }
    this.apiService.verifyContact({ email: this.openRegForm.email }).subscribe({
      next: (res) => {
        if (res.email_available) {
          this.openRegForm.emailVerified = true;
          this.dialogService.toast('Email verified -- not already registered.', 'success');
        } else {
          this.dialogService.toast('This email is already registered.', 'error');
        }
      },
      error: () => this.dialogService.toast('Verification unavailable. Try again later.', 'warning')
    });
  }

  sendOpenPhoneVerification(): void {
    if (!this.openRegForm.phone) return;
    this.apiService.verifyContact({ phone: this.openRegForm.phone }).subscribe({
      next: (res) => {
        if (res.phone_available) {
          this.openRegForm.phoneVerified = true;
          this.dialogService.toast('Phone verified -- not already registered.', 'success');
        } else {
          this.dialogService.toast('This phone number is already registered.', 'error');
        }
      },
      error: () => {
        if (this.contentService.isPhoneTaken(this.openRegForm.phone)) {
          this.dialogService.toast('This phone number is already registered locally.', 'error');
        } else {
          this.openRegForm.phoneVerified = true;
          this.dialogService.toast('Phone verified (offline check).', 'success');
        }
      }
    });
  }

  onOpenRegPhotoSelected(event: any): void {
    const files = event.target?.files;
    if (files?.length) {
      this.processFiles(files, 'openRegPhoto');
    }
  }

  onOpenRegDocSelected(event: any): void {
    const files = event.target?.files;
    if (files?.length) {
      this.processFiles(files, 'openRegDocs');
    }
  }

  removeOpenRegPhoto(): void {
    this.openRegPhotoUrl = null;
    this.openRegPhotoFileId = null;
    this.selectedFileIds['openRegPhoto'] = [];
    this.selectedFileNames['openRegPhoto'] = [];
  }

  removeOpenRegDoc(): void {
    this.openRegDocName = null;
    this.openRegDocFileId = null;
    this.selectedFileIds['openRegDocs'] = [];
    this.selectedFileNames['openRegDocs'] = [];
  }

  async loadOpenRegPhoto(): Promise<void> {
    const ids = this.selectedFileIds['openRegPhoto'] || [];
    if (ids.length) {
      const file = await this.fileStorage.get(ids[ids.length - 1]);
      if (file?.blob) {
        this.openRegPhotoUrl = URL.createObjectURL(file.blob);
        this.openRegPhotoFileId = ids[ids.length - 1];
      }
    }
  }

  async loadOpenRegDoc(): Promise<void> {
    const names = this.selectedFileNames['openRegDocs'] || [];
    const ids = this.selectedFileIds['openRegDocs'] || [];
    if (names.length) {
      this.openRegDocName = names[names.length - 1];
      this.openRegDocFileId = ids[ids.length - 1];
    }
  }

  getInitials(name: string, fallback: string = 'N/A'): string {
    if (!name) return fallback;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  getTrackDetails(trackId: string) {
    const t = this.tracks.find(x => x.id === trackId);
    return t || { id: 'other', label: 'NTIC Track', icon: 'science' };
  }

  toggleRightPanel(mode: 'preview' | 'list'): void {
    this.rightPanelMode = mode;
  }

  hasExpertiseSelected(): boolean {
    return Object.values(this.instructorForm.expertise).some(v => v);
  }

  saveDraft(): void {
    let contact = '';
    let formData: any = null;

    switch (this.activeTab) {
      case 'school':
        contact = this.schoolForm.repEmail || this.schoolForm.email;
        formData = { ...this.schoolForm, selectedFileIds: this.selectedFileIds, selectedFileNames: this.selectedFileNames };
        break;
      case 'instructor':
        contact = this.instructorForm.email;
        formData = { ...this.instructorForm };
        break;
      case 'student':
        if (this.competitorMode === 'group') {
          contact = this.teamForm.leadEmail || '';
          formData = { ...this.teamForm, competitorMode: 'group' };
        } else {
          contact = this.studentForm.email;
          formData = { ...this.studentForm, selectedTrack: this.selectedTrack };
        }
        break;
      case 'judge':
        contact = this.judgeForm.email;
        formData = { ...this.judgeForm, selectedFileIds: this.selectedFileIds, selectedFileNames: this.selectedFileNames };
        break;
      case 'sponsor':
        contact = this.sponsorForm.email;
        formData = { ...this.sponsorForm, selectedFileIds: this.selectedFileIds, selectedFileNames: this.selectedFileNames };
        break;
      case 'team':
        contact = this.teamForm.leadEmail;
        formData = { ...this.teamForm };
        break;
      case 'open':
        contact = this.openRegForm.email;
        formData = { ...this.openRegForm };
        break;
    }

    if (!contact) {
      this.showCustomAlert('Please fill in your email address before saving a draft.', 'Email Required', 'warning');
      return;
    }

    const contactKey = contact.trim().toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    drafts[contactKey] = {
      tab: this.activeTab,
      data: formData,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
    this.apiService.saveDraft({ email: contactKey, data: { tab: this.activeTab, data: formData, savedAt: new Date().toISOString() } }).subscribe();
    this.dialogService.toast('Saved to draft', 'success');
  }

  generateJudgeTicket(): void {
    if (!this.judgeForm.ticketCode && this.judgeForm.name) {
      this.judgeForm.ticketCode = `TKN-${this.randomSuffix(4)}-NTIC`;
      // No OTP is invented here; the server issues the password on submit.
      this.judgeForm.otp = '';
    }
  }

  selectRolePath(role: string): void {
    this.clearValidationState();
    this.isPathModalOpen = false;
    if (role === 'sponsor') {
      this.activeTab = 'sponsor';
      this.isDraftResumed = false;
      this.regState = 'new';
      this.saveRegState();
      return;
    }
    if (role === 'student') {
      this.activeTab = 'student';
      this.studentForm = {
        name: '',
        id: '',
        email: '',
        dob: '',
        gender: '',
        school: '',
        class: '',
        guardianName: '',
        guardianPhone: '',
        region: 'Greater Accra',
        track: '',
        skills: {
          alg: 'intermediate',
          hw: 'novice',
          ai: 'novice'
        }
      };
      this.teamForm = {
        name: '',
        school: '',
        region: 'Greater Accra',
        track: '',
        leadName: '',
        leadEmail: '',
        member2Name: '',
        member2Email: '',
        member3Name: '',
        member3Email: '',
        member4Name: '',
        member4Email: '',
        member5Name: '',
        member5Email: '',
        skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
      };
      this.regState = 'new';
      this.saveRegState();
      return;
    }
    if (role === 'open') {
      this.activeTab = 'open';
      this.openRegForm = {
        fullName: '',
        email: '',
        phone: '',
        ageGroup: 'junior',
        experienceLevel: 'beginner',
        organization: '',
        selectedCompetitionId: '',
        acceptedTerms: false,
        emailVerified: false,
        phoneVerified: false
      };
      this.openRegPhotoUrl = null;
      this.openRegDocName = null;
      this.openRegPhotoFileId = null;
      this.openRegDocFileId = null;
      this.loadOpenCompetitions();
      this.regState = 'new';
      this.saveRegState();
      return;
    }
    this.activeTab = role;
    this.isDraftResumed = false;
    if (role === 'school') {
      this.clearDraftPrefills();
    } else if (role === 'instructor') {
      this.instructorForm = {
        name: '',
        tel: '',
        email: '',
        address: '',
        region: 'Greater Accra',
        qualification: 'BSc',
        institution: '',
        isIndependent: false,
        acceptedTerms: false,
        portfolio: '',
        expertise: {
          Python: false,
          JavaScript: false,
          'C#': false,
          AI: false,
          Robotics: false,
          'Networking & Cybersecurity': false,
          'Data Science': false
        }
      };
    } else if (role === 'judge') {
      this.judgeForm = {
        name: '',
        tel: '',
        email: '',
        organization: '',
        region: 'Greater Accra',
        expertise: '',
        experience: '',
        bio: '',
        ticketCode: '',
        otp: '',
        acceptedTerms: false
      };
    }
    this.regState = 'new';
    this.saveRegState();
  }

  private clearTimer(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  private loadSavedRegUi(): any {
    try {
      localStorage.removeItem('ntic_reg_ui');
      const raw = sessionStorage.getItem('ntic_reg_ui');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveRegState(): void {
    try {
      const state = {
        regState: this.regState,
        activeTab: this.activeTab,
        schoolStep: this.schoolStep,
        maxSchoolStepReached: this.maxSchoolStepReached,
        trackerQuery: this.trackerQuery
      };
      sessionStorage.setItem('ntic_reg_ui', JSON.stringify(state));
      localStorage.removeItem('ntic_reg_ui');

      const queryParams: Record<string, any> = {
        section: this.regState !== 'gateway' ? this.regState : null,
        tab: this.regState === 'new' ? this.activeTab : null,
        step: this.regState === 'new' && this.activeTab === 'school' && this.schoolStep > 1 ? this.schoolStep : null,
        q: this.regState === 'tracker' && this.trackerQuery ? this.trackerQuery : null
      };

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } catch {}
  }

  private clearRegState(): void {
    try {
      sessionStorage.removeItem('ntic_reg_ui');
      localStorage.removeItem('ntic_reg_ui');
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { section: null, tab: null, step: null, q: null, code: null, track: null, admin: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } catch {}
  }

  private clearDraftPrefills(): void {
    this.isDraftResumed = false;
    this.schoolStep = 1;
    this.maxSchoolStepReached = 1;
    this.gpsAddress = '';

    // Clear uploaded files & document state
    this.selectedFileIds = {};
    this.selectedFileNames = {};
    this.schoolLogoUrl = null;
    this.judgeLogoUrl = null;
    this.sponsorLogoUrl = null;
    this.studentPhotoUrl = null;
    this.groupPhotoUrl = null;
    this.missingDocsError = '';

    // Clear validation states
    this.clearValidationState();

    // Clear form models back to clean initial state
    this.schoolForm = {
      name: '',
      category: 'Public High School',
      region: 'Greater Accra',
      district: '',
      tel: '',
      email: '',
      gps: '',
      repName: '',
      repEmail: '',
      repTel: '',
      students: [],
      teams: [],
      acceptedTerms: false,
      gdpaConsent: false,
      gdpaConsentTimestamp: ''
    };

    this.instructorForm = {
      name: '',
      tel: '',
      email: '',
      address: '',
      region: 'Greater Accra',
      qualification: 'BSc',
      institution: '',
      isIndependent: false,
      acceptedTerms: false,
      portfolio: '',
      expertise: {
        Python: false,
        JavaScript: false,
        'C#': false,
        AI: false,
        Robotics: false,
        Cybersecurity: false,
        'Data Science': false
      } as { [key: string]: boolean }
    };

    this.studentForm = {
      name: '',
      id: '',
      email: '',
      dob: '',
      gender: '',
      school: '',
      class: '',
      guardianName: '',
      guardianPhone: '',
      region: 'Greater Accra',
      track: '',
      skills: {
        alg: 'intermediate',
        hw: 'novice',
        ai: 'novice'
      }
    };

    this.teamForm = {
      name: '',
      school: '',
      region: 'Greater Accra',
      track: '',
      leadName: '',
      leadEmail: '',
      member2Name: '',
      member2Email: '',
      member3Name: '',
      member3Email: '',
      member4Name: '',
      member4Email: '',
      member5Name: '',
      member5Email: '',
      skills: { alg: 'intermediate', hw: 'novice', ai: 'novice' }
    };

    this.judgeForm = {
      name: '',
      tel: '',
      email: '',
      organization: '',
      region: 'Greater Accra',
      expertise: '',
      experience: '',
      bio: '',
      ticketCode: '',
      otp: '',
      acceptedTerms: false
    };

    this.sponsorForm = {
      name: '',
      sector: 'Energy & Mining',
      repName: '',
      repContact: '',
      email: '',
      region: 'Greater Accra',
      package: '',
      acceptedTerms: false,
      arenas: {
        'Coding Track': true,
        'Robotics Arena': true,
        'AI & ML Challenge': true,
        'Cyber Security CTF': true,
        'Open Innovation': true
      } as { [key: string]: boolean }
    };
    this.selectedPackages = [];

    sessionStorage.removeItem('ntic_reg_ui');
    localStorage.removeItem('ntic_reg_ui');
  }

  private applyDraftPrefills(contact: string): void {
    const key = contact?.trim().toLowerCase();
    const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
    let draft = drafts[key] || drafts[contact];

    if (!draft) {
      this.apiService.loadDraft(key, this.resumeToken).subscribe({
        next: (res) => { if (res?.data) { this.restoreDraftData(res.data); } },
        error: (err) => {
          // 403 means the draft exists but this client has not proven it owns
          // the address. Tell the user instead of failing silently.
          if (err?.status === 403) {
            this.showCustomAlert(
              err?.error?.detail || 'Verify this email address to load its saved registration.',
              'Verification Required', 'info'
            );
          }
        }
      });
      return;
    }
    this.restoreDraftData(draft);
  }

  private restoreDraftData(draft: any): void {
    this.clearDraftPrefills();

    this.isDraftResumed = true;
    this.activeTab = draft.tab;

    switch (draft.tab) {
      case 'school':
        this.schoolStep = 1;
        this.maxSchoolStepReached = 4;
        this.schoolForm = { ...this.schoolForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        break;
      case 'instructor':
        this.instructorForm = { ...this.instructorForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        break;
      case 'student':
        if (draft.data?.competitorMode === 'group') {
          this.teamForm = { ...this.teamForm, ...draft.data };
          this.competitorMode = 'group';
        } else {
          this.studentForm = { ...this.studentForm, ...draft.data };
          this.selectedTrack = draft.data?.selectedTrack || '';
          this.competitorMode = 'individual';
        }
        break;
      case 'judge':
        this.judgeForm = { ...this.judgeForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        if (this.selectedFileIds['judgeLogo']?.length) this.loadJudgeLogo();
        break;
      case 'sponsor':
        this.sponsorForm = { ...this.sponsorForm, ...draft.data };
        if (draft.data?.selectedFileIds) this.selectedFileIds = { ...draft.data.selectedFileIds };
        if (draft.data?.selectedFileNames) this.selectedFileNames = { ...draft.data.selectedFileNames };
        if (this.selectedFileIds['sponsorLogo']?.length) this.loadSponsorLogo();
        break;
      case 'team':
        this.teamForm = { ...this.teamForm, ...draft.data };
        break;
      case 'open':
        this.openRegForm = { ...this.openRegForm, ...draft.data };
        break;
    }
  }

  openPreviewModal(): void {
    if (!this.schoolForm.name) {
      this.showCustomAlert('Please fill out the form (at least the School Name) before previewing.', 'Form Incomplete', 'warning');
      return;
    }
    this.isPreviewModalOpen = true;
  }

  closePreviewModal(): void {
    this.isPreviewModalOpen = false;
  }

  async submitRegistration(): Promise<void> {
    if (this.isSubmitting) return;
    if (!this.validateCurrentTab()) return;

    // Final pre-submit guard against duplicate emails & phones across PostgreSQL database
    let targetEmail = '';
    let targetPhone = '';
    if (this.activeTab === 'school') {
      targetEmail = this.schoolForm.repEmail || this.schoolForm.email;
      targetPhone = this.schoolForm.repTel || this.schoolForm.tel;
    } else if (this.activeTab === 'instructor') {
      targetEmail = this.instructorForm.email;
      targetPhone = this.instructorForm.tel;
    } else if (this.activeTab === 'judge') {
      targetEmail = this.judgeForm.email;
      targetPhone = this.judgeForm.tel;
    } else if (this.activeTab === 'sponsor') {
      targetEmail = this.sponsorForm.email;
      targetPhone = this.sponsorForm.repContact;
    } else if (this.activeTab === 'team') {
      targetEmail = this.teamForm.leadEmail;
    }

    if (targetEmail || targetPhone) {
      try {
        const avail = await firstValueFrom(this.apiService.checkAvailability(targetEmail, targetPhone));
        if (avail && avail.email_taken && !this.editingApprovalId) {
          this.isSubmitting = false;
          this.isPreviewModalOpen = false;
          this.showCustomAlert(`The email address "${targetEmail}" is already registered in the system. Please use a different email address or sign in.`, 'Email Already Registered', 'warning');
          return;
        }
        if (avail && avail.phone_taken && !this.editingApprovalId) {
          this.isSubmitting = false;
          this.isPreviewModalOpen = false;
          this.showCustomAlert(`The phone number "${targetPhone}" is already registered in the system. Please use a different phone number.`, 'Phone Already Registered', 'warning');
          return;
        }
      } catch {
        if (targetEmail && this.contentService.isEmailTaken(targetEmail, this.editingApprovalId || undefined)) {
          this.isSubmitting = false;
          this.isPreviewModalOpen = false;
          this.showCustomAlert(`The email address "${targetEmail}" is already registered.`, 'Email Already Registered', 'warning');
          return;
        }
      }
    }

    this.isSubmitting = true;

    // Capture school logo file ID (not base64 -- too large for storage)
    let logoFileId: string | null = null;
    if (this.activeTab === 'school' && this.schoolLogoUrl) {
      logoFileId = this.selectedFileIds['schoolLogo']?.[0] || null;
    }
    
    // Simulate API call with modern loader
    setTimeout(() => {
    try {
      this.isSubmitting = false;
      this.isPreviewModalOpen = false;

      // Add to pending approvals in localStorage via ContentService
      let approvalType: 'School Registration' | 'Team Addition' | 'Instructor Access' | null = null;
      let entity = '';
      let contact = '';
      let details: any = {};

      if (this.activeTab === 'school') {
        approvalType = 'School Registration';
        entity = this.schoolForm.name;
        contact = this.schoolForm.repEmail || this.schoolForm.email;
        details = {
          region: this.schoolForm.region,
          district: this.schoolForm.district,
          category: this.schoolForm.category,
          phone: this.schoolForm.repTel || this.schoolForm.tel,
          email: this.schoolForm.email,
          gps: this.schoolForm.gps,
          gpsAddress: this.gpsAddress,
          repName: this.schoolForm.repName,
          repEmail: this.schoolForm.repEmail,
          repTel: this.schoolForm.repTel,
          code: this.editingApprovalId
            ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('school'))
            : this.generateApplicationCode('school'),
          tracks: this.schoolForm.teams.map((t: any) => t.track).filter((value: any, index: number, self: any[]) => self.indexOf(value) === index).join(', ') || 'Coding, Robotics',
          teamsList: this.schoolForm.teams,
          studentCount: this.schoolForm.students.length + this.schoolForm.teams.reduce((sum: number, t: any) => {
            const count = t.rosterList?.length || t.members?.length || [t.leadName, t.member2Name, t.member3Name, t.member4Name, t.member5Name].filter(Boolean).length;
            return sum + (count > 0 ? count : 1);
          }, 0),
          students: this.schoolForm.students.map((s: any) => ({ id: s.id, name: s.name, track: s.track, class: s.class, dob: s.dob, gender: s.gender, guardianName: s.guardianName, guardianPhone: s.guardianPhone, skills: s.skills })),
          docs: this.selectedFileIds['accredDocs']?.length
            ? this.selectedFileIds['accredDocs'].map((id, i) => `${id}::${this.selectedFileNames['accredDocs']?.[i] || 'document.pdf'}`)
            : [],
          dataProtectionConsent: {
            act: 'Ghana Data Protection Act (Act 843)',
            consented: true,
            timestamp: this.schoolForm.gdpaConsentTimestamp || new Date().toISOString(),
            legalBasis: 'Explicit consent (Act 843 §20) & competition participation agreement'
          }
        };
        if (logoFileId) details.logoFileId = logoFileId;


        // Log student registrations
        if (this.activeTab === 'school' && this.schoolForm.students?.length) {
          const currentAudit2 = [...this.contentService.auditLogs];
          currentAudit2.unshift({
            action: `${this.schoolForm.students.length} students registered under ${this.schoolForm.name}`,
            user: this.schoolForm.repEmail || this.schoolForm.email,
            time: new Date().toISOString(),
            type: 'auth'
          });
          this.contentService.saveAuditLogs(currentAudit2);
        }
      } else if (this.activeTab === 'team') {
        approvalType = 'Team Addition';
        entity = this.teamForm.name;
        contact = this.teamForm.leadEmail;
        const rosterList = [this.teamForm.leadName, this.teamForm.member2Name, this.teamForm.member3Name, this.teamForm.member4Name, this.teamForm.member5Name].filter(Boolean).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
        details = {
          school: this.teamForm.school,
          track: this.teamForm.track,
          project: this.teamForm.name + ' Sandbox Project',
          members: rosterList,
          coach: 'Instructor assigned by ' + this.teamForm.school,
          code: this.editingApprovalId
            ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('team'))
            : this.generateApplicationCode('team')
        };

        const currentTeams = [...this.contentService.teams];
        const memberPhotoIds: string[] = [];
        ['memberLeadPhoto', 'member2Photo', 'member3Photo', 'member4Photo', 'member5Photo'].forEach(k => {
          const id = this.selectedFileIds[k]?.[0];
          if (id) memberPhotoIds.push(id);
        });
        
          // --- INTEGRATION: POSTGRESQL BACKEND ---
          try {
            const names = this.teamForm.leadName.trim().split(' ');
            this.apiService.createStudent({
              first_name: names[0] || 'Unknown',
              last_name: names.slice(1).join(' ') || 'Student',
              email: this.teamForm.leadEmail,
              track: this.teamForm.track,
              consent_granted: true
            }).subscribe({
              next: (res) => console.log('Successfully saved student to PostgreSQL DB:', res),
              error: (err) => console.error('Failed to save to PostgreSQL:', err)
            });
          } catch(e) {}
          // ---------------------------------------

          const regTeam: any = {
          name: this.teamForm.name,
          track: this.teamForm.track || 'Coding',
          lead: this.teamForm.leadName || 'Student Captain',
          members: Math.max(rosterList.length, 3),
          rosterList: rosterList,
          status: 'In Competition',
          schoolName: this.teamForm.school || 'Registered Institution',
          memberPhotos: memberPhotoIds.length ? memberPhotoIds : undefined
        };
        currentTeams.push(regTeam);
        // Deliberately NOT calling syncNewTeamToBackend here. This branch files a
        // 'Team Addition' approval (see approvalType above), so creating the team
        // at the same time contradicted it: the team went live before anyone
        // reviewed it. For an anonymous registrant the call 401'd and was
        // swallowed, but a signed-in school admin really did create the team and
        // skip approval. The team is now created by the admin approve handler.
        this.contentService.saveTeams(currentTeams);
      } else if (this.activeTab === 'instructor') {
        approvalType = 'Instructor Access';
        entity = this.instructorForm.name;
        contact = this.instructorForm.email;
        const selectedExpertise = Object.keys(this.instructorForm.expertise)
          .filter(k => this.instructorForm.expertise[k])
          .join(', ');
        details = {
          address: this.instructorForm.address || '',
          region: this.instructorForm.region || '',
          institution: this.instructorForm.isIndependent ? 'Independent Mentor' : (this.instructorForm.institution || 'Independent Mentor'),
          isIndependent: this.instructorForm.isIndependent || false,
          credentials: this.instructorForm.qualification || 'MSc Computer Science',
          specialization: selectedExpertise || 'Coding, AI',
          phone: this.instructorForm.tel || '',
          portfolio: this.instructorForm.portfolio || '',
          experience: 'Mentor with registered history',
          courses: ['LMS Course 101: Python Intro', 'LMS Course 202: Robotics Base'],
          code: this.editingApprovalId
            ? (this.contentService.pendingApprovals.find(a => a.id === this.editingApprovalId)?.details?.code || this.generateApplicationCode('instructor'))
            : this.generateApplicationCode('instructor'),
          docs: this.selectedFileIds['instructorDocs']?.length
            ? this.selectedFileIds['instructorDocs'].map((id, i) => `${id}::${this.selectedFileNames['instructorDocs']?.[i] || 'document.pdf'}`)
            : undefined
        };
      } else if (this.activeTab === 'judge') {
        const ticket = 'NTIC-JDG-' + this.randomSuffix();
        // Assigned from the server's response below - never generated here.
        let otp = '';
        const judgeLogoId = this.selectedFileIds['judgeLogo']?.[0] || null;
        const newJudge: any = {
          id: 'USR-' + Date.now(),
          role: 'judge' as const,
          fullName: this.judgeForm.name,
          email: this.judgeForm.email,
          phone: this.judgeForm.tel,
          otp: '',
          organization: this.judgeForm.organization,
          region: this.judgeForm.region || '',
          track: this.judgeForm.expertise || 'Coding & Algorithms',
          experience: this.judgeForm.experience || '',
          bio: this.judgeForm.bio || '',
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (judgeLogoId) (newJudge as any).logoFileId = judgeLogoId;
        // Create server-side FIRST; the server issues the one-time password.
        // registerPublicUser, not createUser: POST /api/users is admin-only, so
        // this call always failed for an applicant and no judge account was ever
        // created. `status` is not sent -- the server forces 'pending', which is
        // also why the old `status: 'Active'` here was a self-activation attempt
        // that only failed by accident.
        this.apiService.registerPublicUser({
          email: newJudge.email,
          full_name: newJudge.fullName,
          role: newJudge.role,
          ticket: newJudge.ticket,
          phone: newJudge.phone || ''
        } as any).subscribe({
          next: (created: any) => {
            otp = created?.temporary_password || '';
            newJudge.otp = otp;
            const currentUsers = [...this.contentService.users];
            currentUsers.unshift(newJudge);
            this.contentService.saveUsers(currentUsers);

            const currentAudit = [...this.contentService.auditLogs];
            currentAudit.unshift({
              action: `Judge token ${ticket} generated for ${newJudge.fullName}`,
              user: 'self-register@ntic.gov.gh',
              time: new Date().toISOString(),
              type: 'ticket'
            });
            this.contentService.saveAuditLogs(currentAudit);

            this.openCredentialsModal(
              'Judge Application Submitted! 🎉',
              'Your judge profile has been created. Copy and save your secure login credentials below:',
              ticket,
              otp,
              'Use these credentials to access the Judge & Grading Portal.',
              '/judge',
              newJudge.email,
              'judge'
            );
          },
          error: () => {
            this.dialogService.toast('Failed to save account. Please try again.', 'error');
          }
        });
      } else if (this.activeTab === 'sponsor') {
        const ticket = 'NTIC-SPO-' + this.randomSuffix();
        // Assigned from the server's response below - never generated here.
        let otp = '';
        const logoFileId = this.selectedFileIds['sponsorLogo']?.[0] || null;
        const newSponsor: any = {
          id: 'USR-' + Date.now(),
          role: 'sponsor' as const,
          fullName: this.sponsorForm.name,
          email: this.sponsorForm.email,
          phone: this.sponsorForm.repContact,
          otp: '',
          organization: this.sponsorForm.name,
          package: this.sponsorForm.package || '',
          sector: this.sponsorForm.sector || '',
          region: this.sponsorForm.region || '',
          repName: this.sponsorForm.repName || '',
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (logoFileId) (newSponsor as any).logoFileId = logoFileId;
        // Create server-side FIRST; the server issues the one-time password.
        // See the judge branch above: createUser is admin-only, so this never ran.
        this.apiService.registerPublicUser({
          email: newSponsor.email,
          full_name: newSponsor.fullName,
          role: newSponsor.role,
          ticket: newSponsor.ticket,
          phone: newSponsor.phone || ''
        } as any).subscribe({
          next: (created: any) => {
            otp = created?.temporary_password || '';
            newSponsor.otp = otp;
            const currentUsers = [...this.contentService.users];
            currentUsers.unshift(newSponsor);
            this.contentService.saveUsers(currentUsers);

            const currentAudit = [...this.contentService.auditLogs];
            currentAudit.unshift({
              action: `Sponsor token ${ticket} generated for ${newSponsor.fullName}`,
              user: 'self-register@ntic.gov.gh',
              time: new Date().toISOString(),
              type: 'ticket'
            });
            this.contentService.saveAuditLogs(currentAudit);

            this.openCredentialsModal(
              'Sponsor Profile Registered! 🎉',
              'Your sponsor account has been created. Copy and save your secure credentials below:',
              ticket,
              otp,
              'Use these credentials to access the Sponsor Portal.',
              '/sponsors',
              newSponsor.email,
              'sponsor'
            );
          },
          error: () => {
            this.dialogService.toast('Failed to save account. Please try again.', 'error');
          }
        });
      }
      else if (this.activeTab === 'open' && this.openRegForm.selectedCompetitionId) {
        const selectedComp = this.getSelectedCompetition();
        if (!selectedComp) {
          this.dialogService.toast('Please select a competition cycle.', 'error');
          return;
        }
        const ticket = 'NTIC-OPN-' + this.randomSuffix();
        // Assigned from the server's response below - never generated here.
        let otp = '';
        const newUser: any = {
          id: 'USR-' + Date.now(),
          role: 'student' as const,
          fullName: this.openRegForm.fullName,
          email: this.openRegForm.email,
          phone: this.openRegForm.phone || '',
          otp: '',
          organization: this.openRegForm.organization || 'Open Registration',
          ageGroup: this.openRegForm.ageGroup,
          experienceLevel: this.openRegForm.experienceLevel,
          competitionId: selectedComp.id,
          competitionTitle: selectedComp.title,
          track: selectedComp.track,
          ticket,
          status: 'Active',
          registeredAt: new Date().toLocaleDateString('en-GB'),
          lastLogin: 'Never'
        };
        if (this.openRegPhotoFileId) (newUser as any).profilePhotoFileId = this.openRegPhotoFileId;
        if (this.openRegDocFileId) (newUser as any).docFileId = this.openRegDocFileId;

        // Open-competition entry. Was calling the admin-only POST /api/users, so
        // no participant account was ever created. The public endpoint records
        // them as 'pending' for activation rather than self-activating.
        this.apiService.registerPublicUser({
          email: newUser.email,
          full_name: newUser.fullName,
          role: 'student',
          ticket: newUser.ticket,
          phone: newUser.phone || '',
          organization: newUser.organization || '',
          age_group: newUser.ageGroup || '',
          experience_level: newUser.experienceLevel || '',
          competition_id: newUser.competitionId || '',
          photo_file_id: this.openRegPhotoFileId || '',
          doc_file_id: this.openRegDocFileId || ''
        } as any).subscribe({
          next: (created: any) => {
            otp = created?.temporary_password || '';
            newUser.otp = otp;
            const currentUsers = [...this.contentService.users];
            currentUsers.unshift(newUser);
            this.contentService.saveUsers(currentUsers);
            const currentAudit = [...this.contentService.auditLogs];
            currentAudit.unshift({
              action: `Open registration ticket ${ticket} for ${newUser.fullName} into ${selectedComp.title}`,
              user: 'self-register@ntic.gov.gh',
              time: new Date().toISOString(),
              type: 'ticket'
            });
            this.contentService.saveAuditLogs(currentAudit);
            this.openCredentialsModal(
              'Open Registration Successful!',
              `You're registered for "${selectedComp.title}". Copy your credentials below:`,
              ticket,
              otp,
              'Use these credentials to log in and start competing.',
              '/dashboard',
              newUser.email,
              'student'
            );
          },
          error: () => {
            this.dialogService.toast('Failed to save account. Please try again.', 'error');
          }
        });
      }

      if (approvalType) {
        const currentApprovals = [...this.contentService.pendingApprovals];
        if (this.editingApprovalId) {
          const idx = currentApprovals.findIndex(a => a.id === this.editingApprovalId);
          if (idx > -1) {
            currentApprovals[idx] = {
              ...currentApprovals[idx],
              type: approvalType,
              entity,
              contact,
              submitted: 'Updated ' + new Date().toLocaleString('en-GB'),
              details
            };
          } else {
            currentApprovals.unshift({
              id: 'REQ-' + Date.now(),
              type: approvalType,
              entity,
              contact,
              submitted: 'Just now',
              details
            });
          }
        } else {
          currentApprovals.unshift({
            id: 'REQ-' + Date.now(),
            type: approvalType,
            entity,
            contact,
            submitted: 'Just now',
            details
          });
        }
        this.contentService.saveApprovals(currentApprovals);

        // The application has to exist on the server or no reviewer will ever see
        // it. saveApprovals() above only reaches POST /api/bulk-sync, which is
        // admin-only, so for an anonymous applicant it 401'd and the application
        // lived solely in this browser -- while the confirmation email below told
        // them it had been received. This files it for real.
        if (approvalType && entity) {
          this.apiService.submitPublicApplication({
            type: approvalType,
            entity,
            contact,
            details
          }).subscribe({
            next: () => {},
            error: (err: any) => {
              const detail = err?.error?.detail || err?.message || 'Unknown error';
              this.dialogService.toast(
                err?.status === 0
                  ? 'Your application could not be sent to the server. Please check your connection and submit again.'
                  : `Your application was not received: ${detail}`,
                'error'
              );
            }
          });
        }

        const emailTo = contact || '';
        const emailName = entity || '';
        let phone = '';
        if (this.activeTab === 'school') phone = this.schoolForm.repTel || this.schoolForm.tel || '';
        else if (this.activeTab === 'team') phone = '';
        else if (this.activeTab === 'instructor') phone = this.instructorForm.tel || '';
        if (emailTo) {
          this.emailService.sendPendingConfirmation(emailTo, emailName, emailName, approvalType, details?.code || this.lastApplicationCode || '');
        }

        const currentAudit = [...this.contentService.auditLogs];
        currentAudit.unshift({
          action: this.editingApprovalId ? `Application updated (${approvalType}): ${entity}` : `New ${approvalType} requested: ${entity}`,
          user: contact,
          time: new Date().toISOString(),
          type: 'approval'
        });
        this.contentService.saveAuditLogs(currentAudit);
      }

      // Remove this draft from saved drafts
      if (contact) {
        const drafts = JSON.parse(localStorage.getItem('ntic_drafts') || '{}');
        delete drafts[contact.trim().toLowerCase()];
        localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
      }

      this.justUpdatedApplication = !!this.editingApprovalId;
      this.editingApprovalId = null;
      this.lastApplicationCode = details.code || null;
      this.copiedApplicationCode = false;
      this.isSuccessModalOpen = true;
      this.clearDraftPrefills();
    } catch (err) {
      console.error('[Registration] Submission error:', err);
      this.isSubmitting = false;
      this.isPreviewModalOpen = false;
      this.dialogService.toast('Submission failed. Please try again. Error: ' + (err as any)?.message, 'error');
    }
    }, 1500);
  }

  closeSuccessModal(): void {
    this.isSuccessModalOpen = false;
    this.justUpdatedApplication = false;
    this.lastApplicationCode = null;
    this.copiedApplicationCode = false;
    this.regState = 'gateway';
    this.clearRegState();
    this.judgeForm = {
      name: '',
      tel: '',
      email: '',
      organization: '',
      region: 'Greater Accra',
      expertise: '',
      experience: '',
      bio: '',
      ticketCode: '',
      otp: '',
      acceptedTerms: false
    };
    this.clearDraftPrefills();
  }
}
