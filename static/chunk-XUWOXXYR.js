import{Cb as C,G as T,J as I,Vb as y,fc as l,i as c,qa as h,zb as A}from"./chunk-3I7Y5M5O.js";import{a as u,b as d,g as n}from"./chunk-MON7YFGF.js";var f="ntic_chat_session",B=(()=>{class k{constructor(e){this.http=e,this.API_URL=`${l.apiUrl}/chat`,this.isOpen=h(!1),this.isLoading=h(!1),this.isEscalated=h(!1),this.messages=h([]),this.showTicketPrompt=h(!1),this.showEmailInput=h(!1),this.showTicketLookup=h(!1),this.ticketLookupId=h(""),this.ticketLookupResult=h(null),this.showAccountLookup=h(!1),this.supportTickets=h([]),this.recycleBinTickets=h([]),this.currentUserId="",this.currentUserEmail="",this.currentUserRole="",this.escapeCount=0,this.ACCOUNT_FLOW=`

ACCOUNT & LOGIN RULES (apply to all roles):
- If someone says "I created an account" / "I just registered" / "I signed up" -- their account IS READY. Tell them to log in with their email and password using the Login button on the landing page. Do NOT tell them to go to /registration again.
- If someone asks "how do I log in" -- tell them to click the Login button on the landing page and enter their email + password.
- If someone says "I registered but can't log in" -- tell them to double-check their email and password are correct. If still stuck, offer to create a support ticket.
- If someone asks "where is my account" or "do I have an account" -- tell them: if you already registered, just log in to see your dashboard.
- Normal flow: Register (/registration) \u2192 Log in \u2192 Dashboard (/dashboard).
- NEVER tell someone who says they already registered to "go to registration page" again. That makes no sense. Instead, help them log in.`,this.ROLE_CONTEXTS={student:`You are a friendly AI helper for the NTIC Ghana Championship website. A student is talking to you.

Platform pages students use:
- /registration -- Sign up as a student
- /dashboard -- Your profile and submissions
- /competitions -- See all competition tracks: Coding, Robotics, AI, Networking & Cybersecurity, Innovation
- /leaderboard -- Check rankings
- /lms -- Take courses and lessons
- /profile-completion -- Finish setting up your profile

How to help:
- Give short, direct answers. 1-3 sentences max.
- Always say which page to go to (e.g. "Go to the Registration page to sign up.")
- Use very simple words -- talk like you're explaining to a 12-year-old.
- Be friendly and encouraging.
- Never say "I'd love to help" or "feel free to". Just answer.
- IMPORTANT: If you genuinely cannot help (the question is outside NTIC, requires human judgment, or you lack the info), end your message with [ESCALATE]. Do NOT use this for simple questions you can answer.`,instructor:`You are an AI assistant for the NTIC Ghana Championship. An instructor is talking to you.

Platform pages:
- /dashboard -- Team rosters, student submissions, and readiness metrics
- /lms -- Manage courses and learning modules
- /competitions -- Active championship tracks and milestones
- /leaderboard -- See student and team rankings

Keep answers short. Mention the exact page name. Be clear and direct.`,school_admin:`You are an AI assistant for the NTIC Ghana Championship. A school admin is talking to you.

Platform pages:
- /registration -- Manage team registrations and enroll students
- /dashboard -- School overview
- /leaderboard -- Check school performance

Keep answers short. Mention the exact page name. Be clear.`,judge:`You are an AI assistant for the NTIC Ghana Championship. A judge is talking to you.

Platform pages:
- /competitions -- Review submissions, score heats, and evaluate rubrics
- /dashboard -- Assigned competition tracks & overview
- /leaderboard -- Live championship rankings

Keep answers short. Mention the exact page. Be precise.`,sponsor:`You are an AI assistant for the NTIC Ghana Championship. A sponsor is talking to you.

Platform pages:
- /sponsors -- See your sponsorship portal and benefits
- /talent -- Discover top performers
- /leaderboard -- Rankings

Keep answers short. Mention the exact page. Be professional but concise.`,super_admin:`You are an AI assistant for the NTIC Ghana Championship with full platform access. A super admin is talking to you.

Platform pages:
- /dashboard -- Analytics and reports
- /user-management -- Manage users and roles
- /competitions -- Manage tracks and phases
- /reporting -- System analytics
- /records -- Database records

Keep answers short. Mention the exact page. Be technical and direct.`,content_manager:`You are an AI assistant for the NTIC Ghana Championship. A content manager is talking to you.

Platform pages:
- /lms-manager -- Create courses, modules, lessons
- /news -- Manage news articles and announcements
- /competitions -- Set up challenges

Keep answers short. Mention the exact page. Be clear.`,reviewer:`You are an AI assistant for the NTIC Ghana Championship. A reviewer is talking to you.

Platform pages:
- /registration -- Review and approve registrations
- /records -- Check submission records

Keep answers short. Mention the exact page. Be clear.`,competition_manager:`You are an AI assistant for the NTIC Ghana Championship. A competition manager is talking to you.

Platform pages:
- /competitions -- Manage tracks, phases, deadlines
- /leaderboard -- Monitor standings
- /dashboard -- Overview

Keep answers short. Mention the exact page. Be clear.`,support_admin:`You are an AI assistant for the NTIC Ghana Championship. A support admin is talking to you.

Platform pages:
- /dashboard -- View and respond to support tickets
- /user-management -- Look up users
- /records -- Check user records

Keep answers short. Mention the exact page. Be empathetic but concise.`},this.DEFAULT_GREETING=(t,s)=>{let a={student:`Hey ${t}! \u{1F44B} I'm your NTIC helper. Ask me about tracks, submissions, courses, your account, or anything on the platform. What's up?`,instructor:`Hi ${t}! I can help with grading, student work, and the instructor tools. What do you need?`,school_admin:`Hi ${t}! Ask me about registrations, teams, or school stats. What can I help with?`,judge:`Hi ${t}! I can help with rubrics, scoring, and reviews. What do you need?`,sponsor:`Hi ${t}! Ask me about sponsorships, talent discovery, or leaderboard data.`,super_admin:`Hi ${t}! Full platform access here. Ask me anything about users, analytics, or competitions.`,support_admin:`Hi ${t}! I can help with support tickets and user issues. What's up?`,default:`Hey ${t}! \u{1F44B} I'm your NTIC helper. What can I do for you?`};return a[s]||a.default},this.ticketPollTimer=null,this.loadFromSession()}loadFromSession(){try{let e=sessionStorage.getItem(f);if(e){let t=JSON.parse(e),s=y("activeUserEmail")||"";if(t.userId&&t.userId!==s){sessionStorage.removeItem(f);return}if(t.messages?.length){let a=t.messages.map(i=>d(u({},i),{timestamp:new Date(i.timestamp)}));this.messages.set(a)}t.isEscalated&&this.isEscalated.set(!0),this.currentUserId=t.userId||"",this.currentUserEmail=t.userEmail||"",this.currentUserRole=t.userRole||""}}catch{}}saveToSession(){try{sessionStorage.setItem(f,JSON.stringify({messages:this.messages(),isEscalated:this.isEscalated(),userId:this.currentUserId,userEmail:this.currentUserEmail,userRole:this.currentUserRole}))}catch{}}resetSession(){this.isOpen.set(!1),this.isEscalated.set(!1),this.messages.set([]),this.currentUserId="",this.currentUserEmail="",this.currentUserRole="";try{sessionStorage.removeItem(f)}catch{}}openChat(e,t,s,a){return n(this,null,function*(){this.isOpen.set(!0);let i=s||"",r=a||"",o=t||"guest";if(i!==this.currentUserId||o!==this.currentUserRole?(this.currentUserId=i,this.currentUserEmail=r,this.currentUserRole=o,this.isEscalated.set(!1),this.showTicketPrompt.set(!1),this.showEmailInput.set(!1),this.showTicketLookup.set(!1),this.escapeCount=0,this.messages.set([]),sessionStorage.removeItem(f)):(this.currentUserId=i,this.currentUserEmail=r,this.currentUserRole=o),this.currentUserId){let m=yield this.fetchMyTicket(this.currentUserId);m&&(this.isEscalated.set(!0),this.messages().length>0&&this.injectPendingAdminReplies(m),this.startPolling(this.currentUserId))}if(this.messages().length===0){let m=this.DEFAULT_GREETING(e.split(" ")[0],o);this.messages.set([{role:"model",text:m,timestamp:new Date}]),this.saveToSession()}})}closeChat(){this.isOpen.set(!1),this.stopPolling()}toggleChat(e,t,s,a){return n(this,null,function*(){this.isOpen()?this.closeChat():yield this.openChat(e,t,s,a)})}clearHistory(e,t){this.stopPolling(),this.isEscalated.set(!1),this.showTicketPrompt.set(!1),this.showEmailInput.set(!1),this.showTicketLookup.set(!1),this.escapeCount=0,this.messages.set([]),sessionStorage.removeItem(f),this.openChat(e,t)}sendMessage(e,t){return n(this,null,function*(){if(!e.trim()||this.isLoading())return;let s=()=>{let i={role:"user",text:e.trim(),timestamp:new Date};this.messages.update(r=>[...r,i]),this.saveToSession()};if(this.showEmailInput()){let i=e.trim();if(s(),i.includes("@")&&i.includes(".")){this.createTicket(i);return}let r={role:"model",text:"That doesn't look like a valid email. Please enter a working email address.",timestamp:new Date};this.messages.update(o=>[...o,r]),this.saveToSession();return}if(/check\s+ticket|ticket\s+status|lookup/i.test(e)){this.showTicketLookup.set(!0);return}if(/verify.*account|check.*account|account.*ready|is.*my.*account|registration.*(status|confirmed|complete|go.*through)|did.*register|am.*i.*registered/i.test(e)){this.showAccountLookup.set(!0);return}if(this.showAccountLookup()){let i=e.trim();if(s(),i.includes("@")&&i.includes(".")){this.lookupAccount(i);return}let r={role:"model",text:"That doesn't look like a valid email. Please enter the email you registered with.",timestamp:new Date};this.messages.update(o=>[...o,r]),this.saveToSession();return}if(this.showTicketPrompt()){let i=e.toLowerCase();if(/yes|ok|sure|yeah|create|do it|go ahead/.test(i)){s(),this.acceptTicketCreation();return}if(/no|nope|not now|never mind|cancel/.test(i)){s(),this.rejectTicketCreation();return}}let a={role:"user",text:e.trim(),timestamp:new Date};this.messages.update(i=>[...i,a]),this.saveToSession(),this.isLoading.set(!0),this.messages.update(i=>[...i,{role:"model",text:"",timestamp:new Date,isTyping:!0}]);try{let i=this.ROLE_CONTEXTS[t]||this.ROLE_CONTEXTS.student,r=this.messages().filter(g=>!g.isTyping&&g.role!=="human_support");for(;r.length>0&&r[0].role!=="user";)r.shift();let o=r.slice(-12).map(g=>({role:g.role==="user"?"user":"model",parts:[{text:g.text}]}));o.length>0&&o[0].role!=="user"&&o.shift();let w={system_instruction:{parts:[{text:`${i}${this.ACCOUNT_FLOW}

CRITICAL RULES:
- Keep responses under 80 words.
- Give the page path (e.g. /registration).
- Use simple words. No fluff. Be friendly but direct.
- If you genuinely cannot answer (out of scope, needs human, unclear), put [ESCALATE] at the end. Only use this when you truly can't help. Do NOT use it for simple questions.`}]},contents:o,generationConfig:{temperature:.7,maxOutputTokens:512,topP:.9}},p=(yield c(this.http.post(this.API_URL,w,{headers:new A({"Content-Type":"application/json"})})))?.candidates?.[0]?.content?.parts?.[0]?.text||"I apologise, I could not generate a response. Please try again.";p=p.replace(/\*\*/g,"").replace(/\*/g,"-");let U=p.includes("[ESCALATE]");p=p.replace(/\[ESCALATE\]/g,"").trim(),this.messages.update(g=>{let v=[...g.filter(R=>!R.isTyping),{role:"model",text:p,timestamp:new Date}];return U?(this.escapeCount++,this.escapeCount>=2&&(this.showTicketPrompt.set(!0),this.escapeCount=0)):this.escapeCount=0,v})}catch(i){console.error("CHATBOT DEBUG: API_URL is",this.API_URL),console.error("CHATBOT DEBUG: Error is",i);let r=i?.status===403?`\u26A0\uFE0F The AI service is not configured right now. But I can create a support ticket for you -- just reply "yes" and I'll ask for your email.`:"\u26A0\uFE0F I'm having trouble connecting right now. Please try again in a moment.";this.messages.update(o=>{let m=[...o.filter(p=>!p.isTyping),{role:"model",text:r,timestamp:new Date}];return i?.status===403&&this.showTicketPrompt.set(!0),m})}finally{this.isLoading.set(!1),this.saveToSession()}})}loadAllTickets(){return n(this,null,function*(){if(y("activeUserToken"))try{let t=yield c(this.http.get(`${l.apiUrl}/tickets`));this.supportTickets.set(t.map(s=>this.parseTicket(s)))}catch(t){console.error("loadAllTickets failed",t)}})}fetchMyTicket(e){return n(this,null,function*(){if(!y("activeUserToken")||!e)return null;try{let s=yield c(this.http.get(`${l.apiUrl}/tickets?user_id=${encodeURIComponent(e)}`));if(s&&s.length>0){let a=this.parseTicket(s[0]);return this.supportTickets.update(i=>i.find(o=>o.id===a.id)?i.map(o=>o.id===a.id?a:o):[a,...i]),a}}catch(s){console.error("fetchMyTicket failed",s)}return null})}parseTicket(e){return{id:e.id,userId:e.user_id,userName:e.user_name,userRole:e.user_role,userEmail:e.user_email,status:e.status||"open",chatHistory:(e.chat_history||[]).map(t=>d(u({},t),{timestamp:new Date(t.timestamp||t.created_at||Date.now())})),adminReplies:(e.admin_replies||[]).map(t=>d(u({},t),{timestamp:new Date(t.timestamp||Date.now())})),createdAt:new Date(e.created_at||Date.now()),lastUpdated:new Date(e.last_updated||Date.now()),unreadByUser:!1,isDeleted:!!e.is_deleted,deletedAt:e.deleted_at?new Date(e.deleted_at):null}}startPolling(e){this.stopPolling(),this.ticketPollTimer=setInterval(()=>n(this,null,function*(){let t=yield this.fetchMyTicket(e);t&&this.injectPendingAdminReplies(t)}),8e3)}stopPolling(){this.ticketPollTimer&&(clearInterval(this.ticketPollTimer),this.ticketPollTimer=null)}acceptTicketCreation(){this.showTicketPrompt.set(!1),this.showEmailInput.set(!0);let e={role:"model",text:"Okay! What email address should I send the ticket to?",timestamp:new Date};this.messages.update(t=>[...t,e]),this.saveToSession()}rejectTicketCreation(){this.showTicketPrompt.set(!1);let e={role:"model",text:"No problem! I'll keep trying to help. Just ask me anything.",timestamp:new Date};this.messages.update(t=>[...t,e]),this.saveToSession()}createTicket(e){return n(this,null,function*(){this.showEmailInput.set(!1),this.isLoading.set(!0),this.isEscalated.set(!0);let t=this.messages().filter(s=>!s.isTyping&&s.role!=="human_support");try{let a=(yield c(this.http.post(`${l.apiUrl}/tickets`,{userId:this.currentUserId||e,userName:this.currentUserId?"User":e.split("@")[0],userRole:this.currentUserRole||"guest",userEmail:e,chatHistory:t}))).id,i={id:a,userId:this.currentUserId||e,userName:"User",userRole:this.currentUserRole||"guest",userEmail:e,status:"open",createdAt:new Date,lastUpdated:new Date,chatHistory:t,adminReplies:[],unreadByUser:!1};this.supportTickets.update(o=>[i,...o]);let r={role:"model",text:`\u2705 Done! Your support ticket **${a}** has been created.

We sent a confirmation to **${e}**.

\u{1F4CB} **Save your ticket ID!** When an admin replies, come back and type "check ticket" to see the response.`,timestamp:new Date};this.messages.update(o=>[...o,r]),this.startPolling(i.userId)}catch(s){console.error("createTicket failed",s),this.isEscalated.set(!1);let a={role:"model",text:"\u26A0\uFE0F Sorry, I couldn't create the ticket right now. Please try again later.",timestamp:new Date};this.messages.update(i=>[...i,a])}finally{this.isLoading.set(!1),this.saveToSession()}})}checkTicketById(e){return n(this,null,function*(){if(e.trim()){this.isLoading.set(!0);try{let t=yield c(this.http.get(`${l.apiUrl}/tickets/${e.trim()}`)),s=this.parseTicket(t);if(s.adminReplies.length>0){let a=s.adminReplies.map(o=>`\u{1F4DD} **${o.agentName}**: ${o.text}`).join(`

`),i=s.status==="resolved"?"\u2705 Resolved":"\u23F3 In Progress",r={role:"model",text:`\u{1F4CB} **Ticket ${e}** -- ${i}

${a}`,timestamp:new Date};this.messages.update(o=>[...o,r])}else{let a={role:"model",text:`\u{1F4CB} **Ticket ${e}** is still open. No replies yet -- an admin will respond soon. Check back later!`,timestamp:new Date};this.messages.update(i=>[...i,a])}}catch(t){console.error("checkTicketById failed",t);let s={role:"model",text:`\u274C I couldn't find ticket **${e}**. Double-check the ID and try again.`,timestamp:new Date};this.messages.update(a=>[...a,s])}finally{this.isLoading.set(!1),this.ticketLookupId.set(""),this.saveToSession()}}})}lookupAccount(e){return n(this,null,function*(){this.isLoading.set(!0);try{let t=yield c(this.http.get(`${l.apiUrl}/users/lookup?email=${encodeURIComponent(e.trim().toLowerCase())}`)),s;if(t.found){let a=t.status==="Active"?"\u2705 Active":`\u23F3 ${t.status}`;s={role:"model",text:`\u2705 **Account Found!**

Email: ${t.email}
Status: ${a}

Your account is ready to use. Just log in with your email and password!`,timestamp:new Date}}else s={role:"model",text:`\u274C **No account found** for **${e}**.

That email is not registered. Would you like to sign up? Go to the /registration page to create an account.`,timestamp:new Date};this.messages.update(a=>[...a,s])}catch(t){console.error("lookupAccount failed",t);let s={role:"model",text:"\u26A0\uFE0F I couldn't reach the verification service right now. Please try again in a moment, or create a support ticket and I'll check for you.",timestamp:new Date};this.messages.update(a=>[...a,s])}finally{this.isLoading.set(!1),this.showAccountLookup.set(!1),this.saveToSession()}})}addAdminReply(e,t,s){return n(this,null,function*(){try{yield c(this.http.post(`${l.apiUrl}/tickets/${e}/reply`,{agentName:t,text:s}));let a={agentName:t,text:s,timestamp:new Date};this.supportTickets.update(r=>r.map(o=>o.id!==e?o:d(u({},o),{status:"in_progress",lastUpdated:new Date,adminReplies:[...o.adminReplies,a],unreadByUser:!0})));let i=this.supportTickets().find(r=>r.id===e);i&&i.userId===this.currentUserId&&(this.messages.update(r=>[...r,{role:"human_support",text:s,timestamp:new Date,agentName:t}]),this.saveToSession())}catch(a){console.error("addAdminReply failed",a)}})}resolveTicket(e){return n(this,null,function*(){try{yield c(this.http.patch(`${l.apiUrl}/tickets/${e}/status`,{status:"resolved"})),this.supportTickets.update(t=>t.map(s=>s.id===e?d(u({},s),{status:"resolved",lastUpdated:new Date}):s))}catch(t){console.error("resolveTicket failed",t)}})}loadRecycleBinTickets(){return n(this,null,function*(){if(y("activeUserToken"))try{let t=yield c(this.http.get(`${l.apiUrl}/tickets?recycled=true`));this.recycleBinTickets.set((t||[]).map(s=>this.parseTicket(s)))}catch(t){console.error("loadRecycleBinTickets failed",t)}})}deleteTicket(e){return n(this,null,function*(){try{yield c(this.http.delete(`${l.apiUrl}/tickets/${e}`));let t=this.supportTickets().find(s=>s.id===e);if(t){let s=d(u({},t),{isDeleted:!0,deletedAt:new Date});this.supportTickets.update(a=>a.filter(i=>i.id!==e)),this.recycleBinTickets.update(a=>[s,...a.filter(i=>i.id!==e)])}else yield this.loadAllTickets(),yield this.loadRecycleBinTickets();return!0}catch(t){return console.error("deleteTicket failed",t),!1}})}restoreTicket(e){return n(this,null,function*(){try{yield c(this.http.post(`${l.apiUrl}/tickets/${e}/restore`,{}));let t=this.recycleBinTickets().find(s=>s.id===e);if(t){let s=d(u({},t),{isDeleted:!1,deletedAt:null,lastUpdated:new Date});this.recycleBinTickets.update(a=>a.filter(i=>i.id!==e)),this.supportTickets.update(a=>[s,...a.filter(i=>i.id!==e)])}else yield this.loadAllTickets(),yield this.loadRecycleBinTickets();return!0}catch(t){return console.error("restoreTicket failed",t),!1}})}permanentlyDeleteTicket(e){return n(this,null,function*(){try{return yield c(this.http.delete(`${l.apiUrl}/tickets/${e}/permanent`)),this.recycleBinTickets.update(t=>t.filter(s=>s.id!==e)),this.supportTickets.update(t=>t.filter(s=>s.id!==e)),!0}catch(t){return console.error("permanentlyDeleteTicket failed",t),!1}})}emptyRecycleBin(){return n(this,null,function*(){try{return yield c(this.http.delete(`${l.apiUrl}/tickets/recycle-bin/empty`)),this.recycleBinTickets.set([]),!0}catch(e){return console.error("emptyRecycleBin failed",e),!1}})}injectPendingAdminReplies(e){if(!e||e.status==="resolved")return;let t=this.messages().at(-1)?.timestamp?.getTime()||0,s=e.adminReplies.filter(a=>new Date(a.timestamp).getTime()>t);if(s.length>0){let a=s.map(i=>({role:"human_support",text:i.text,timestamp:new Date(i.timestamp),agentName:i.agentName}));this.messages.update(i=>[...i,...a]),this.saveToSession()}}get openTicketsCount(){return this.supportTickets().filter(e=>e.status==="open"||e.status==="in_progress").length}static{this.\u0275fac=function(t){return new(t||k)(I(C))}}static{this.\u0275prov=T({token:k,factory:k.\u0275fac,providedIn:"root"})}}return k})();export{B as a};
