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
  private readonly API_URL = `${environment.apiUrl}/chat`;

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
    student: `You are a friendly AI helper for the NTIC Ghana Championship website. A student is talking to you.

Platform pages students use:
- /registration — Sign up as a student
- /dashboard — Your profile and submissions
- /competitions — See all competition tracks: Coding, Robotics, AI, Cybersecurity, Innovation
- /leaderboard — Check rankings
- /lms — Take courses and lessons
- /profile-completion — Finish setting up your profile

How to help:
- Give short, direct answers. 1-3 sentences max.
- Always say which page to go to (e.g. "Go to the Registration page to sign up.")
- Use very simple words — talk like you're explaining to a 12-year-old.
- Be friendly and encouraging.
- Never say "I'd love to help" or "feel free to". Just answer.`,

    instructor: `You are an AI assistant for the NTIC Ghana Championship. An instructor is talking to you.

Platform pages:
- /instructor — View and grade student submissions
- /dashboard — Your profile
- /lms — Manage courses
- /leaderboard — See student rankings

Keep answers short. Mention the exact page name. Be clear and direct.`,

    school_admin: `You are an AI assistant for the NTIC Ghana Championship. A school admin is talking to you.

Platform pages:
- /registration — Manage team registrations and enroll students
- /dashboard — School overview
- /leaderboard — Check school performance

Keep answers short. Mention the exact page name. Be clear.`,

    judge: `You are an AI assistant for the NTIC Ghana Championship. A judge is talking to you.

Platform pages:
- /judge — Review submissions, score, see rubrics
- /competitions — See tracks and scoring criteria
- /leaderboard — Rankings

Keep answers short. Mention the exact page. Be precise.`,

    sponsor: `You are an AI assistant for the NTIC Ghana Championship. A sponsor is talking to you.

Platform pages:
- /sponsors — See your sponsorship portal and benefits
- /talent — Discover top performers
- /leaderboard — Rankings

Keep answers short. Mention the exact page. Be professional but concise.`,

    super_admin: `You are an AI assistant for the NTIC Ghana Championship with full platform access. A super admin is talking to you.

Platform pages:
- /dashboard — Analytics and reports
- /user-management — Manage users and roles
- /competitions — Manage tracks and phases
- /reporting — System analytics
- /records — Database records

Keep answers short. Mention the exact page. Be technical and direct.`,

    content_manager: `You are an AI assistant for the NTIC Ghana Championship. A content manager is talking to you.

Platform pages:
- /lms-manager — Create courses, modules, lessons
- /news — Manage news articles and announcements
- /competitions — Set up challenges

Keep answers short. Mention the exact page. Be clear.`,

    reviewer: `You are an AI assistant for the NTIC Ghana Championship. A reviewer is talking to you.

Platform pages:
- /registration — Review and approve registrations
- /records — Check submission records

Keep answers short. Mention the exact page. Be clear.`,

    competition_manager: `You are an AI assistant for the NTIC Ghana Championship. A competition manager is talking to you.

Platform pages:
- /competitions — Manage tracks, phases, deadlines
- /leaderboard — Monitor standings
- /dashboard — Overview

Keep answers short. Mention the exact page. Be clear.`,

    support_admin: `You are an AI assistant for the NTIC Ghana Championship. A support admin is talking to you.

Platform pages:
- /dashboard — View and respond to support tickets
- /user-management — Look up users
- /records — Check user records

Keep answers short. Mention the exact page. Be empathetic but concise.`,
  };

  private readonly DEFAULT_GREETING = (userName: string, role: string): string => {
    const greetings: Record<string, string> = {
      student: `Hey ${userName}! 👋 I'm your NTIC helper. Ask me about tracks, submissions, courses, or anything on the platform. What's up?`,
      instructor: `Hi ${userName}! I can help with grading, student work, and the instructor tools. What do you need?`,
      school_admin: `Hi ${userName}! Ask me about registrations, teams, or school stats. What can I help with?`,
      judge: `Hi ${userName}! I can help with rubrics, scoring, and reviews. What do you need?`,
      sponsor: `Hi ${userName}! Ask me about sponsorships, talent discovery, or leaderboard data.`,
      super_admin: `Hi ${userName}! Full platform access here. Ask me anything about users, analytics, or competitions.`,
      support_admin: `Hi ${userName}! I can help with support tickets and user issues. What's up?`,
      default: `Hey ${userName}! 👋 I'm your NTIC helper. What can I do for you?`
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
          parts: [{ text: `${systemInstruction}\n\nCRITICAL: Keep every response under 80 words. Give the page path (like /registration) when relevant. Use simple words a 12-year-old can understand. No fluff. No "feel free". No "I'd love to". Just answer. Be friendly but get to the point.` }]
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
