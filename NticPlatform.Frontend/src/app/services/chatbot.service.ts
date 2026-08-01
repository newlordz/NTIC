import { getAuthValue } from './session.util';
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
  showTicketPrompt = signal(false);
  showEmailInput = signal(false);
  showTicketLookup = signal(false);
  ticketLookupId = signal('');
  ticketLookupResult = signal<SupportTicket | null>(null);

  // Shared in-memory support tickets (acts as a simple store)
  supportTickets = signal<SupportTicket[]>([]);

  private currentUserId = '';
  private currentUserEmail = '';
  private currentUserRole = '';
  private escapeCount = 0;

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
- Never say "I'd love to help" or "feel free to". Just answer.
- IMPORTANT: If you genuinely cannot help (the question is outside NTIC, requires human judgment, or you lack the info), end your message with [ESCALATE]. Do NOT use this for simple questions you can answer.`,

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
        const activeEmail = getAuthValue('activeUserEmail') || '';
        
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
  async openChat(userName: string, role: string, userId?: string, email?: string): Promise<void> {
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
      this.showTicketPrompt.set(false);
      this.showEmailInput.set(false);
      this.showTicketLookup.set(false);
      this.escapeCount = 0;
      this.messages.set([]);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      this.currentUserId = targetUserId;
      this.currentUserEmail = targetEmail;
      this.currentUserRole = targetRole;
    }

    // Fetch existing ticket from backend and inject admin replies
    if (this.currentUserId) {
      const ticket = await this.fetchMyTicket(this.currentUserId);
      if (ticket) {
        this.isEscalated.set(true);
        if (this.messages().length > 0) {
          this.injectPendingAdminReplies(ticket);
        }
        this.startPolling(this.currentUserId);
      }
    }

    if (this.messages().length === 0) {
      const greeting = this.DEFAULT_GREETING(userName.split(' ')[0], targetRole);
      this.messages.set([{ role: 'model', text: greeting, timestamp: new Date() }]);
      this.saveToSession();
    }
  }

  closeChat(): void {
    this.isOpen.set(false);
    this.stopPolling();
  }

  async toggleChat(userName: string, role: string, userId?: string, email?: string): Promise<void> {
    if (this.isOpen()) {
      this.closeChat();
    } else {
      await this.openChat(userName, role, userId, email);
    }
  }

  clearHistory(userName: string, role: string): void {
    this.stopPolling();
    this.isEscalated.set(false);
    this.showTicketPrompt.set(false);
    this.showEmailInput.set(false);
    this.showTicketLookup.set(false);
    this.escapeCount = 0;
    this.messages.set([]);
    sessionStorage.removeItem(STORAGE_KEY);
    this.openChat(userName, role);
  }

  // ─── SEND MESSAGE ────────────────────────────────────────────────────
  async sendMessage(userText: string, userRole: string): Promise<void> {
    if (!userText.trim() || this.isLoading()) return;

    // Handle email collection state
    if (this.showEmailInput()) {
      const email = userText.trim();
      if (email.includes('@') && email.includes('.')) {
        this.createTicket(email);
        return;
      }
      const warn: ChatMessage = { role: 'model', text: 'That doesn\'t look like a valid email. Please enter a working email address.', timestamp: new Date() };
      this.messages.update(msgs => [...msgs, warn]);
      this.saveToSession();
      return;
    }

    // Handle "check ticket" keyword
    if (/check\s+ticket|ticket\s+status|lookup/i.test(userText)) {
      this.showTicketLookup.set(true);
      const prompt: ChatMessage = { role: 'model', text: 'Enter your ticket ID below and I\'ll check it for you.', timestamp: new Date() };
      this.messages.update(msgs => [...msgs, prompt]);
      this.saveToSession();
      return;
    }

    // Handle ticket prompt responses
    if (this.showTicketPrompt()) {
      const lower = userText.toLowerCase();
      if (/yes|ok|sure|yeah|create|do it|go ahead/.test(lower)) {
        this.acceptTicketCreation();
        return;
      }
      if (/no|nope|not now|never mind|cancel/.test(lower)) {
        this.rejectTicketCreation();
        return;
      }
    }

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
          parts: [{ text: `${systemInstruction}\n\nCRITICAL RULES:\n- Keep responses under 80 words.\n- Give the page path (e.g. /registration).\n- Use simple words. No fluff. Be friendly but direct.\n- If you genuinely cannot answer (out of scope, needs human, unclear), put [ESCALATE] at the end. Only use this when you truly can't help. Do NOT use it for simple questions.` }]
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

      // Check for escalation marker
      const needsTicket = botText.includes('[ESCALATE]');
      botText = botText.replace(/\[ESCALATE\]/g, '').trim();

      this.messages.update(msgs => {
        const filtered = msgs.filter(m => !m.isTyping);
        const result: ChatMessage[] = [...filtered, { role: 'model', text: botText, timestamp: new Date() }];

        if (needsTicket) {
          this.escapeCount++;
          if (this.escapeCount >= 2) {
            this.showTicketPrompt.set(true);
            this.escapeCount = 0;
          }
        } else {
          this.escapeCount = 0;
        }

        return result;
      });
    } catch (error: any) {
      console.error('CHATBOT DEBUG: API_URL is', this.API_URL);
      console.error('CHATBOT DEBUG: Error is', error);
      const errorText = error?.status === 403
        ? '⚠️ The AI service is not configured right now. But I can create a support ticket for you — just reply "yes" and I\'ll ask for your email.'
        : '⚠️ I\'m having trouble connecting right now. Please try again in a moment.';
      this.messages.update(msgs => {
        const filtered = msgs.filter(m => !m.isTyping);
        const result: ChatMessage[] = [...filtered, { role: 'model', text: errorText, timestamp: new Date() }];
        if (error?.status === 403) {
          this.showTicketPrompt.set(true);
        }
        return result;
      });
    } finally {
      this.isLoading.set(false);
      this.saveToSession();
    }
  }

  // ─── TICKET PERSISTENCE ─────────────────────────────────────────────
  private ticketPollTimer: any = null;

  /** Admin: load all tickets from backend */
  async loadAllTickets(): Promise<void> {
    try {
      const tickets: any = await this.http.get(`${environment.apiUrl}/tickets`).toPromise();
      this.supportTickets.set(tickets.map((t: any) => this.parseTicket(t)));
    } catch (_) {}
  }

  /** User: fetch own ticket from backend and merge into local state */
  async fetchMyTicket(userId: string): Promise<SupportTicket | null> {
    try {
      const tickets: any = await this.http.get(`${environment.apiUrl}/tickets?user_id=${encodeURIComponent(userId)}`).toPromise();
      if (tickets && tickets.length > 0) {
        const t = this.parseTicket(tickets[0]);
        this.supportTickets.update(list => {
          const existing = list.find(x => x.id === t.id);
          if (existing) {
            return list.map(x => x.id === t.id ? t : x);
          }
          return [t, ...list];
        });
        return t;
      }
    } catch (_) {}
    return null;
  }

  private parseTicket(t: any): SupportTicket {
    return {
      id: t.id,
      userId: t.user_id,
      userName: t.user_name,
      userRole: t.user_role,
      userEmail: t.user_email,
      status: t.status || 'open',
      chatHistory: (t.chat_history || []).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp || m.created_at || Date.now()) })),
      adminReplies: (t.admin_replies || []).map((r: any) => ({ ...r, timestamp: new Date(r.timestamp || Date.now()) })),
      createdAt: new Date(t.created_at || Date.now()),
      lastUpdated: new Date(t.last_updated || Date.now()),
      unreadByUser: false
    };
  }

  /** Start polling for admin replies (user's chat is open) */
  startPolling(userId: string): void {
    this.stopPolling();
    this.ticketPollTimer = setInterval(async () => {
      const ticket = await this.fetchMyTicket(userId);
      if (ticket) {
        this.injectPendingAdminReplies(ticket);
      }
    }, 8000);
  }

  stopPolling(): void {
    if (this.ticketPollTimer) {
      clearInterval(this.ticketPollTimer);
      this.ticketPollTimer = null;
    }
  }

  // ─── SMART TICKET ESCALATION ────────────────────────────────────────

  /** User accepted the bot's offer to create a ticket — ask for email */
  acceptTicketCreation(): void {
    this.showTicketPrompt.set(false);
    this.showEmailInput.set(true);
    const prompt: ChatMessage = {
      role: 'model',
      text: 'Okay! What email address should I send the ticket to?',
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, prompt]);
    this.saveToSession();
  }

  /** User rejected the offer */
  rejectTicketCreation(): void {
    this.showTicketPrompt.set(false);
    const prompt: ChatMessage = {
      role: 'model',
      text: 'No problem! I\'ll keep trying to help. Just ask me anything.',
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, prompt]);
    this.saveToSession();
  }

  /** Create a support ticket after user provides their email */
  async createTicket(userEmail: string): Promise<void> {
    this.showEmailInput.set(false);
    this.isLoading.set(true);
    this.isEscalated.set(true);

    const chatHistory = this.messages().filter(m => !m.isTyping && m.role !== 'human_support');
    try {
      const result: any = await this.http.post(`${environment.apiUrl}/tickets`, {
        userId: this.currentUserId || userEmail,
        userName: this.currentUserId ? 'User' : userEmail.split('@')[0],
        userRole: this.currentUserRole || 'guest',
        userEmail,
        chatHistory
      }).toPromise();

      const ticketId = result.id;
      const ticket: SupportTicket = {
        id: ticketId,
        userId: this.currentUserId || userEmail,
        userName: 'User',
        userRole: this.currentUserRole || 'guest',
        userEmail,
        status: 'open',
        createdAt: new Date(),
        lastUpdated: new Date(),
        chatHistory,
        adminReplies: [],
        unreadByUser: false
      };
      this.supportTickets.update(tickets => [ticket, ...tickets]);

      const confirmMsg: ChatMessage = {
        role: 'model',
        text: `✅ Done! Your support ticket **${ticketId}** has been created.\n\nWe sent a confirmation to **${userEmail}**.\n\n📋 **Save your ticket ID!** When an admin replies, come back and type "check ticket" to see the response.`,
        timestamp: new Date()
      };
      this.messages.update(msgs => [...msgs, confirmMsg]);

      // Start polling for admin replies
      this.startPolling(ticket.userId);
    } catch (_) {
      this.isEscalated.set(false);
      const errMsg: ChatMessage = {
        role: 'model',
        text: '⚠️ Sorry, I couldn\'t create the ticket right now. Please try again later.',
        timestamp: new Date()
      };
      this.messages.update(msgs => [...msgs, errMsg]);
    } finally {
      this.isLoading.set(false);
      this.saveToSession();
    }
  }

  /** Look up ticket by ID */
  async checkTicketById(ticketId: string): Promise<void> {
    if (!ticketId.trim()) return;
    this.isLoading.set(true);

    try {
      const result: any = await this.http.get(`${environment.apiUrl}/tickets/${ticketId.trim()}`).toPromise();
      const ticket = this.parseTicket(result);

      if (ticket.adminReplies.length > 0) {
        const replyText = ticket.adminReplies
          .map(r => `📝 **${r.agentName}**: ${r.text}`)
          .join('\n\n');
        const status = ticket.status === 'resolved' ? '✅ Resolved' : '⏳ In Progress';
        const msg: ChatMessage = {
          role: 'model',
          text: `📋 **Ticket ${ticketId}** — ${status}\n\n${replyText}`,
          timestamp: new Date()
        };
        this.messages.update(msgs => [...msgs, msg]);
      } else {
        const msg: ChatMessage = {
          role: 'model',
          text: `📋 **Ticket ${ticketId}** is still open. No replies yet — an admin will respond soon. Check back later!`,
          timestamp: new Date()
        };
        this.messages.update(msgs => [...msgs, msg]);
      }
    } catch (_) {
      const msg: ChatMessage = {
        role: 'model',
        text: `❌ I couldn't find ticket **${ticketId}**. Double-check the ID and try again.`,
        timestamp: new Date()
      };
      this.messages.update(msgs => [...msgs, msg]);
    } finally {
      this.isLoading.set(false);
      this.ticketLookupId.set('');
      this.saveToSession();
    }
  }

  // ─── ADMIN REPLY ─────────────────────────────────────────────────────
  async addAdminReply(ticketId: string, agentName: string, replyText: string): Promise<void> {
    try {
      await this.http.post(`${environment.apiUrl}/tickets/${ticketId}/reply`, { agentName, text: replyText }).toPromise();

      const reply = { agentName, text: replyText, timestamp: new Date() };
      this.supportTickets.update(tickets => tickets.map(t => {
        if (t.id !== ticketId) return t;
        return { ...t, status: 'in_progress', lastUpdated: new Date(), adminReplies: [...t.adminReplies, reply], unreadByUser: true };
      }));

      const ticket = this.supportTickets().find(t => t.id === ticketId);
      if (ticket && ticket.userId === this.currentUserId) {
        this.messages.update(msgs => [...msgs, { role: 'human_support', text: replyText, timestamp: new Date(), agentName }]);
        this.saveToSession();
      }
    } catch (_) {}
  }

  async resolveTicket(ticketId: string): Promise<void> {
    try {
      await this.http.patch(`${environment.apiUrl}/tickets/${ticketId}/status`, { status: 'resolved' }).toPromise();
      this.supportTickets.update(tickets => tickets.map(t =>
        t.id === ticketId ? { ...t, status: 'resolved', lastUpdated: new Date() } : t
      ));
    } catch (_) {}
  }

  private injectPendingAdminReplies(ticket: SupportTicket): void {
    if (!ticket || ticket.status === 'resolved') return;

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
    }
  }

  get openTicketsCount(): number {
    return this.supportTickets().filter(t => t.status === 'open' || t.status === 'in_progress').length;
  }
}
