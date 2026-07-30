import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  role: 'user' | 'model' | 'human_support';
  text: string;
  timestamp: Date;
  isTyping?: boolean;
  agentName?: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userEmail: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: Date;
  lastUpdated: Date;
  chatHistory: ChatMessage[];
  adminReplies: { agentName: string; text: string; timestamp: Date }[];
  unreadByUser: boolean;
}

const STORAGE_KEY = 'ntic_chat_session';

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${environment.gemini.apiKey}`;

  isOpen = signal(false);
  isLoading = signal(false);
  isEscalated = signal(false);
  messages = signal<ChatMessage[]>([]);

  // Shared in-memory support tickets (acts as a simple store)
  supportTickets = signal<SupportTicket[]>([]);

  private currentUserId = '';
  private currentUserEmail = '';
  private currentUserRole = '';

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
Keep responses professional, detailed, and focused on instructor-level features.`,

    school_admin: `You are a knowledgeable AI assistant for the NTIC Ghana Championship platform, helping a SCHOOL ADMIN user.
Your responsibilities:
- Help manage team registrations and school rosters
- Guide through the team creation and student enrollment process
- Assist with registration approval workflows
- Explain how to monitor school-wide performance on the leaderboard
Keep responses structured and administrative in tone.`,

    judge: `You are a precise AI assistant for the NTIC Ghana Championship platform, helping a JUDGE user.
Your responsibilities:
- Explain the judging rubrics and scoring criteria for each competition track
- Guide judges through the submission review and scoring workflow in the Judging Arena
- Clarify tie-breaking rules and escalation processes
Keep responses authoritative, precise, and structured.`,

    sponsor: `You are a welcoming AI assistant for the NTIC Ghana Championship platform, helping a SPONSOR PARTNER user.
Your responsibilities:
- Explain sponsorship tiers, benefits, and visibility features
- Guide through the Sponsors portal to see showcased talent and top performers
- Provide information about talent discovery features
Keep responses professional and highlight impact and value.`,

    super_admin: `You are a comprehensive AI assistant for the NTIC Ghana Championship platform, helping a SUPER ADMIN user.
Your responsibilities:
- Full platform knowledge: user management, role assignments, and approvals
- Guide through system analytics and reporting dashboards
- Assist with managing competitions, tracks, and phases
You have full platform authority. Provide comprehensive, technical responses.`,

    content_manager: `You are a creative AI assistant for the NTIC Ghana Championship platform, helping a CONTENT MANAGER user.
Your responsibilities:
- Guide through LMS content creation: courses, modules, lessons, and materials
- Help manage news articles, announcements, and platform updates
- Assist with setting up competition challenges and descriptions
Keep responses creative and focused on content quality.`,

    reviewer: `You are a thorough AI assistant for the NTIC Ghana Championship platform, helping a REVIEWER user.
Your responsibilities:
- Guide through reviewing and approving school and student registrations
- Explain the pending approvals workflow and priority queue
- Help assess submission quality and review criteria
Keep responses methodical and approval-process focused.`,

    competition_manager: `You are a strategic AI assistant for the NTIC Ghana Championship platform, helping a COMPETITION MANAGER user.
Your responsibilities:
- Guide through managing competition phases, timelines, and deadlines
- Help configure competition tracks, categories, and prizes
- Assist with monitoring live competition progress and standings
Keep responses strategic and competition-centric.`,

    support_admin: `You are a helpful AI assistant for the NTIC Ghana Championship platform, helping a SUPPORT ADMIN user.
Your responsibilities:
- Help manage and respond to user support tickets
- Provide guidance on resolving common platform issues
- Assist with escalated user problems across all roles
Keep responses empathetic, solutions-focused, and professional.`,
  };

  private readonly DEFAULT_GREETING = (userName: string, role: string): string => {
    const greetings: Record<string, string> = {
      student: `Hi ${userName}! 👋 I'm your NTIC AI Assistant. I can help with your competition track, submissions, LMS, and more. What would you like to know?`,
      instructor: `Hello ${userName}! I'm your NTIC AI Assistant. I can help with student management, grading, and the Instructor Portal. How can I assist?`,
      school_admin: `Welcome ${userName}! I can help with team registrations, school rosters, and monitoring your school's performance. What do you need?`,
      judge: `Hello ${userName}! I can guide you through judging rubrics, scoring workflows, and submission reviews. How can I help?`,
      sponsor: `Welcome ${userName}! I can help you explore top talent, leaderboard data, and your sponsorship portal. What would you like to know?`,
      super_admin: `Hello ${userName}! I have full platform knowledge and can assist with user management, analytics, and competitions. What do you need?`,
      support_admin: `Hello ${userName}! I'm your NTIC AI Assistant. I can help you manage support tickets and resolve user issues. How can I assist?`,
      default: `Hi ${userName}! 👋 I'm your NTIC AI Assistant. How can I help you today?`
    };
    return greetings[role] || greetings['default'];
  };

  constructor(private http: HttpClient) {
    this.loadFromSession();
  }

  // ─── SESSION PERSISTENCE ────────────────────────────────────────────
  private loadFromSession(): void {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const activeEmail = localStorage.getItem('activeUserEmail') || '';
        
        // If stored session belonged to a logged-in user but active email is now different or gone, clear stale session
        if (parsed.userId && parsed.userId !== activeEmail) {
          sessionStorage.removeItem(STORAGE_KEY);
          return;
        }

        if (parsed.messages?.length) {
          // Restore timestamps as Date objects
          const msgs: ChatMessage[] = parsed.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
          this.messages.set(msgs);
        }
        if (parsed.isEscalated) {
          this.isEscalated.set(true);
        }
        this.currentUserId = parsed.userId || '';
        this.currentUserEmail = parsed.userEmail || '';
        this.currentUserRole = parsed.userRole || '';
      }
    } catch (_) {}
  }

  private saveToSession(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        messages: this.messages(),
        isEscalated: this.isEscalated(),
        userId: this.currentUserId,
        userEmail: this.currentUserEmail,
        userRole: this.currentUserRole
      }));
    } catch (_) {}
  }

  resetSession(): void {
    this.isOpen.set(false);
    this.isEscalated.set(false);
    this.messages.set([]);
    this.currentUserId = '';
    this.currentUserEmail = '';
    this.currentUserRole = '';
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  // ─── CHAT LIFECYCLE ─────────────────────────────────────────────────
  openChat(userName: string, role: string, userId?: string, email?: string): void {
    this.isOpen.set(true);
    const targetUserId = userId || '';
    const targetEmail = email || '';
    const targetRole = role || 'guest';

    // If user ID or role has changed (e.g. admin logged out to landing page / guest), clear history
    const identityChanged = (targetUserId !== this.currentUserId) || (targetRole !== this.currentUserRole);

    if (identityChanged) {
      this.currentUserId = targetUserId;
      this.currentUserEmail = targetEmail;
      this.currentUserRole = targetRole;
      this.isEscalated.set(false);
      this.messages.set([]);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      this.currentUserId = targetUserId;
      this.currentUserEmail = targetEmail;
      this.currentUserRole = targetRole;
    }

    if (this.messages().length === 0) {
      const greeting = this.DEFAULT_GREETING(userName.split(' ')[0], targetRole);
      this.messages.set([{ role: 'model', text: greeting, timestamp: new Date() }]);
      this.saveToSession();
    } else {
      // Check if admin has replied while chat was closed
      this.injectPendingAdminReplies();
    }
  }

  closeChat(): void {
    this.isOpen.set(false);
  }

  toggleChat(userName: string, role: string, userId?: string, email?: string): void {
    if (this.isOpen()) {
      this.closeChat();
    } else {
      this.openChat(userName, role, userId, email);
    }
  }

  clearHistory(userName: string, role: string): void {
    this.isEscalated.set(false);
    this.messages.set([]);
    sessionStorage.removeItem(STORAGE_KEY);
    this.openChat(userName, role);
  }

  // ─── SEND MESSAGE ────────────────────────────────────────────────────
  async sendMessage(userText: string, userRole: string): Promise<void> {
    if (!userText.trim() || this.isLoading()) return;

    const userMsg: ChatMessage = { role: 'user', text: userText.trim(), timestamp: new Date() };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.saveToSession();
    this.isLoading.set(true);

    // Add typing indicator
    this.messages.update(msgs => [...msgs, { role: 'model', text: '', timestamp: new Date(), isTyping: true }]);

    try {
      const systemInstruction = this.ROLE_CONTEXTS[userRole] || this.ROLE_CONTEXTS['student'];
      let rawHistory = this.messages()
        .filter(m => !m.isTyping && m.role !== 'human_support');

      // The Gemini API STRICTLY requires the history to start with a 'user' role
      // and alternate 'user' -> 'model'. It will throw 400 Bad Request otherwise.
      while (rawHistory.length > 0 && rawHistory[0].role !== 'user') {
        rawHistory.shift();
      }

      let history = rawHistory
        .slice(-12)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

      if (history.length > 0 && history[0].role !== 'user') {
         history.shift();
      }

      const body = {
        system_instruction: {
          parts: [{ text: `${systemInstruction}\n\nKeep responses concise (under 150 words). Use bullet points or short paragraphs. Be friendly and helpful.` }]
        },
        contents: history,
        generationConfig: { temperature: 0.7, maxOutputTokens: 512, topP: 0.9 }
      };

      const response: any = await this.http.post(this.API_URL, body, {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' })
      }).toPromise();

      let botText = response?.candidates?.[0]?.content?.parts?.[0]?.text
        || 'I apologise, I could not generate a response. Please try again.';

      // Remove markdown asterisks
      botText = botText.replace(/\*\*/g, '').replace(/\*/g, '-');

      this.messages.update(msgs => [
        ...msgs.filter(m => !m.isTyping),
        { role: 'model', text: botText, timestamp: new Date() }
      ]);
    } catch (error: any) {
      console.error('CHATBOT DEBUG: API_URL is', this.API_URL);
      console.error('CHATBOT DEBUG: Error is', error);
      const errorText = error?.status === 403
        ? '⚠️ AI service not configured yet. You can still use "Talk to a Human" to get support!'
        : '⚠️ I\'m having trouble connecting right now. Please try again in a moment.';
      this.messages.update(msgs => [
        ...msgs.filter(m => !m.isTyping),
        { role: 'model', text: errorText, timestamp: new Date() }
      ]);
    } finally {
      this.isLoading.set(false);
      this.saveToSession();
    }
  }

  // ─── HUMAN ESCALATION ───────────────────────────────────────────────
  escalateToHuman(userName: string, userRole: string, userEmail: string): void {
    if (this.isEscalated()) return;

    this.isEscalated.set(true);

    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;
    const ticket: SupportTicket = {
      id: ticketId,
      userId: this.currentUserId || userEmail,
      userName,
      userRole,
      userEmail,
      status: 'open',
      createdAt: new Date(),
      lastUpdated: new Date(),
      chatHistory: [...this.messages().filter(m => !m.isTyping)],
      adminReplies: [],
      unreadByUser: false
    };

    this.supportTickets.update(tickets => [ticket, ...tickets]);

    const confirmMsg: ChatMessage = {
      role: 'model',
      text: `✅ Your support ticket **${ticketId}** has been created! A human support agent will review your conversation and respond here shortly. You can continue chatting with AI in the meantime.`,
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, confirmMsg]);
    this.saveToSession();
  }

  // ─── ADMIN REPLY ─────────────────────────────────────────────────────
  addAdminReply(ticketId: string, agentName: string, replyText: string): void {
    this.supportTickets.update(tickets => tickets.map(t => {
      if (t.id !== ticketId) return t;
      return {
        ...t,
        status: 'in_progress',
        lastUpdated: new Date(),
        adminReplies: [...t.adminReplies, { agentName, text: replyText, timestamp: new Date() }],
        unreadByUser: true
      };
    }));

    // If this user's chat is the one being replied to, inject message
    const ticket = this.supportTickets().find(t => t.id === ticketId);
    if (ticket && ticket.userId === this.currentUserId) {
      const adminMsg: ChatMessage = {
        role: 'human_support',
        text: replyText,
        timestamp: new Date(),
        agentName
      };
      this.messages.update(msgs => [...msgs, adminMsg]);
      this.saveToSession();
    }
  }

  resolveTicket(ticketId: string): void {
    this.supportTickets.update(tickets => tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'resolved', lastUpdated: new Date() } : t
    ));
  }

  private injectPendingAdminReplies(): void {
    const ticket = this.supportTickets().find(t =>
      t.userId === this.currentUserId && t.unreadByUser
    );
    if (!ticket) return;

    const lastMsgTime = this.messages().at(-1)?.timestamp?.getTime() || 0;
    const newReplies = ticket.adminReplies.filter(r => new Date(r.timestamp).getTime() > lastMsgTime);

    if (newReplies.length > 0) {
      const newMsgs = newReplies.map(r => ({
        role: 'human_support' as const,
        text: r.text,
        timestamp: new Date(r.timestamp),
        agentName: r.agentName
      }));
      this.messages.update(msgs => [...msgs, ...newMsgs]);
      this.saveToSession();

      // Mark as read
      this.supportTickets.update(tickets => tickets.map(t =>
        t.id === ticket.id ? { ...t, unreadByUser: false } : t
      ));
    }
  }

  get openTicketsCount(): number {
    return this.supportTickets().filter(t => t.status === 'open' || t.status === 'in_progress').length;
  }
}
