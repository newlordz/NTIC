import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isTyping?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${environment.gemini.apiKey}`;

  isOpen = signal(false);
  isLoading = signal(false);
  messages = signal<ChatMessage[]>([]);

  private readonly ROLE_CONTEXTS: Record<string, string> = {
    student: `You are a friendly and encouraging AI assistant for the NTIC Ghana Championship platform, helping a STUDENT user.
Your responsibilities:
- Help students understand their competition tracks (Coding, Robotics, AI, Cybersecurity, Innovation)
- Guide them through project submission steps
- Help them navigate the LMS (Learning Management System) to access courses and materials
- Explain competition deadlines, phases, and scoring criteria
- Motivate and encourage them in their learning journey
- Answer questions about the leaderboard and their rankings
Keep responses concise, friendly, and encouraging. Use simple, clear language suitable for high school students.`,

    instructor: `You are a professional AI assistant for the NTIC Ghana Championship platform, helping an INSTRUCTOR user.
Your responsibilities:
- Help instructors navigate the Instructor Portal to view and grade student submissions
- Explain how to manage assigned students and track their progress
- Guide them through the assignment review and feedback workflow
- Help interpret student performance data and analytics
- Assist with LMS course management and student assignment tracking
- Explain judging and assessment criteria
Keep responses professional, detailed, and focused on instructor-level features.`,

    school_admin: `You are a knowledgeable AI assistant for the NTIC Ghana Championship platform, helping a SCHOOL ADMIN user.
Your responsibilities:
- Help manage team registrations and school rosters
- Guide through the team creation and student enrollment process
- Assist with registration approval workflows
- Explain how to monitor school-wide performance on the leaderboard
- Help navigate reporting and analytics for the school
- Assist with competition track selection for teams
Keep responses structured and administrative in tone.`,

    judge: `You are a precise AI assistant for the NTIC Ghana Championship platform, helping a JUDGE user.
Your responsibilities:
- Explain the judging rubrics and scoring criteria for each competition track
- Guide judges through the submission review and scoring workflow in the Judging Arena
- Clarify tie-breaking rules and escalation processes
- Help understand how scores are aggregated across tracks
- Assist with accessing and reviewing student project submissions
- Explain code of conduct and impartiality guidelines for judges
Keep responses authoritative, precise, and structured.`,

    sponsor: `You are a welcoming AI assistant for the NTIC Ghana Championship platform, helping a SPONSOR PARTNER user.
Your responsibilities:
- Explain sponsorship tiers, benefits, and visibility features
- Guide through the Sponsors portal to see showcased talent and top performers
- Help understand leaderboard data and school performance metrics
- Provide information about talent discovery features and top student performers
- Explain how sponsorship impacts the competition and students
- Assist with accessing sponsored track performance reports
Keep responses professional, highlight impact and value.`,

    super_admin: `You are a comprehensive AI assistant for the NTIC Ghana Championship platform, helping a SUPER ADMIN user.
Your responsibilities:
- Full platform knowledge: user management, role assignments, and approvals
- Guide through system analytics and reporting dashboards
- Assist with managing competitions, tracks, and phases
- Help with school registration approvals and user management workflows  
- Explain LMS management features (creating courses, modules, materials)
- Provide guidance on competition configuration and prize management
- Help troubleshoot platform issues and explain system features
You have full platform authority. Provide comprehensive, technical responses.`,

    content_manager: `You are a creative AI assistant for the NTIC Ghana Championship platform, helping a CONTENT MANAGER user.
Your responsibilities:
- Guide through LMS content creation: courses, modules, lessons, and materials
- Help manage news articles, announcements, and platform updates
- Assist with setting up competition challenges and descriptions
- Explain content publishing workflows and approval processes
- Help organise and categorise educational materials by track
- Assist with media uploads and resource management
Keep responses creative, detail-oriented, and focused on content quality.`,

    reviewer: `You are a thorough AI assistant for the NTIC Ghana Championship platform, helping a REVIEWER user.
Your responsibilities:
- Guide through reviewing and approving school and student registrations
- Explain the pending approvals workflow and priority queue
- Help assess submission quality and review criteria
- Assist with generating and interpreting review reports
- Clarify escalation procedures for disputed submissions
- Help navigate records and reporting dashboards
Keep responses methodical, structured, and approval-process focused.`,

    competition_manager: `You are a strategic AI assistant for the NTIC Ghana Championship platform, helping a COMPETITION MANAGER user.
Your responsibilities:
- Guide through managing competition phases, timelines, and deadlines
- Help configure competition tracks, categories, and prizes
- Assist with monitoring live competition progress and standings
- Explain how to handle competition rule disputes and appeals
- Help coordinate with judges and track-specific workflows
- Assist with competition reporting and result publication
Keep responses strategic, timeline-focused, and competition-centric.`,
  };

  private readonly DEFAULT_GREETING = (userName: string, role: string): string => {
    const greetings: Record<string, string> = {
      student: `Hi ${userName}! 👋 I'm your NTIC AI Assistant. I can help you with your competition track, project submissions, LMS courses, and more. What would you like to know?`,
      instructor: `Hello ${userName}! I'm your NTIC AI Assistant. I can help you with student management, grading submissions, and using the Instructor Portal. How can I assist you?`,
      school_admin: `Welcome ${userName}! I'm your NTIC AI Assistant. I can help with team registrations, school rosters, and monitoring your school's performance. What do you need?`,
      judge: `Hello ${userName}! I'm your NTIC AI Assistant. I can guide you through the judging rubrics, scoring workflows, and submission reviews. How can I help?`,
      sponsor: `Welcome ${userName}! I'm your NTIC AI Assistant. I can help you explore top talent, understand leaderboard data, and navigate your sponsorship portal. What would you like to know?`,
      super_admin: `Hello ${userName}! I'm your NTIC AI Assistant with full platform knowledge. I can assist with user management, analytics, competition management, and more. What do you need?`,
      default: `Hi ${userName}! 👋 I'm your NTIC AI Assistant. How can I help you today?`
    };
    return greetings[role] || greetings['default'];
  };

  constructor(private http: HttpClient) {}

  openChat(userName: string, role: string): void {
    this.isOpen.set(true);
    if (this.messages().length === 0) {
      const greeting = this.DEFAULT_GREETING(userName.split(' ')[0], role);
      this.messages.set([{
        role: 'model',
        text: greeting,
        timestamp: new Date()
      }]);
    }
  }

  closeChat(): void {
    this.isOpen.set(false);
  }

  toggleChat(userName: string, role: string): void {
    if (this.isOpen()) {
      this.closeChat();
    } else {
      this.openChat(userName, role);
    }
  }

  clearHistory(userName: string, role: string): void {
    this.messages.set([]);
    this.openChat(userName, role);
  }

  async sendMessage(userText: string, userRole: string): Promise<void> {
    if (!userText.trim() || this.isLoading()) return;

    const userMsg: ChatMessage = {
      role: 'user',
      text: userText.trim(),
      timestamp: new Date()
    };

    this.messages.update(msgs => [...msgs, userMsg]);
    this.isLoading.set(true);

    // Add typing indicator
    const typingMsg: ChatMessage = {
      role: 'model',
      text: '',
      timestamp: new Date(),
      isTyping: true
    };
    this.messages.update(msgs => [...msgs, typingMsg]);

    try {
      const systemInstruction = this.ROLE_CONTEXTS[userRole] || this.ROLE_CONTEXTS['student'];

      // Build conversation history for Gemini (exclude typing indicator)
      const history = this.messages()
        .filter(m => !m.isTyping)
        .slice(-10) // Keep last 10 messages for context window efficiency
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));

      const body = {
        system_instruction: {
          parts: [{ text: `${systemInstruction}\n\nIMPORTANT: Keep responses concise (under 150 words). Use bullet points or short paragraphs. Be friendly and helpful.` }]
        },
        contents: history,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
          topP: 0.9
        }
      };

      const response: any = await this.http.post(this.API_URL, body, {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' })
      }).toPromise();

      const botText = response?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'I apologise, I could not generate a response. Please try again.';

      // Replace typing indicator with real response
      this.messages.update(msgs => [
        ...msgs.filter(m => !m.isTyping),
        { role: 'model', text: botText, timestamp: new Date() }
      ]);
    } catch (error: any) {
      const errorText = error?.status === 403
        ? '⚠️ API key not configured. Please contact your administrator.'
        : '⚠️ I\'m having trouble connecting right now. Please try again in a moment.';

      this.messages.update(msgs => [
        ...msgs.filter(m => !m.isTyping),
        { role: 'model', text: errorText, timestamp: new Date() }
      ]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
