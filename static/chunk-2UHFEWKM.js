import{Bb as b,Db as g,G as d,J as c,f as x,gc as l,ic as y,j as h,t as u}from"./chunk-BYMIGR7D.js";import{a as f,b as m}from"./chunk-MON7YFGF.js";var w=(()=>{class n{constructor(e){this.http=e,this.apiUrl=l.apiUrl+"/send-email",this.registrationNoticeUrl=l.apiUrl+"/notify/registration-received"}send(e,t,r,o){this.http.post(this.apiUrl,{to_email:e,to_name:t,subject:r,html_content:o}).subscribe({next:()=>{},error:s=>console.warn("[Email] Failed:",s?.error?.detail||s.message)})}sendPendingConfirmation(e,t,r,o,s){this.http.post(this.registrationNoticeUrl,{to_email:e,to_name:t,entity_name:r,application_type:o,application_code:s||""}).subscribe({next:()=>{},error:i=>console.warn("[Email] Registration notice failed:",i?.error?.detail||i.message)})}sendApprovalEmail(e,t,r,o,s,i){this.send(e,t,`Application Approved -- ${r} | NTIC Ghana`,`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#065f46,#10b981);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Application Approved!</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">NTIC Ghana Championship</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>${t}</strong>,</p>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Congratulations! Your <strong>${o}</strong> for <strong>${r}</strong> has been <strong style="color:#065f46;">approved</strong>.</p>
          <div style="background:#ecfdf5;border:1px solid #34d399;border-radius:8px;padding:16px;margin:0 0 16px;">
            <p style="margin:0 0 8px;color:#065f46;font-size:14px;"><strong>Your Access Credentials:</strong></p>
            <p style="margin:0 0 4px;color:#064e3b;font-size:14px;">Access Pass: <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;">${s}</code></p>
            <p style="margin:0;color:#064e3b;font-size:14px;">Login OTP: <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;">${i}</code></p>
          </div>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Use these credentials to log in to the NTIC Competition Platform. Please keep them secure.</p>
          <p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact <a href="mailto:support@ntic.edu.gh" style="color:#4f46e5;">support@ntic.edu.gh</a></p>
        </div>
      </div>`)}sendRejectionEmail(e,t,r,o,s,i){let p=s.split(",").map(a=>`<li style="margin-bottom:4px;">${a.trim()}</li>`).join("");this.send(e,t,`Application Update -- ${r} | NTIC Ghana`,`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#991b1b,#ef4444);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Application Update</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">NTIC Ghana Championship</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>${t}</strong>,</p>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">After reviewing your <strong>${o}</strong> for <strong>${r}</strong>, we are unable to approve it at this time.</p>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:0 0 16px;">
            <p style="margin:0 0 8px;color:#991b1b;font-size:14px;"><strong>Reasons:</strong></p>
            <ul style="margin:0;padding-left:20px;color:#7f1d1d;font-size:14px;">${p}</ul>
            ${i?`<p style="margin:12px 0 0;color:#7f1d1d;font-size:14px;"><strong>Additional Notes:</strong> ${i}</p>`:""}
          </div>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">You may address the issues above and reapply through the NTIC Registration Portal.</p>
          <p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact <a href="mailto:support@ntic.edu.gh" style="color:#4f46e5;">support@ntic.edu.gh</a></p>
        </div>
      </div>`)}sendPasswordResetEmail(e,t,r,o){this.send(e,t,"Your Password Has Been Reset | NTIC Ghana",`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Password Reset</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">NTIC Ghana Competition Platform</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">Dear <strong>${t}</strong>,</p>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">An administrator has regenerated your login credentials for the NTIC platform.</p>
          <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:16px;margin:0 0 16px;">
            <p style="margin:0 0 8px;color:#1e40af;font-size:14px;"><strong>Your New Temporary Credentials:</strong></p>
            <p style="margin:0 0 4px;color:#1e3a8a;font-size:14px;">Access Ticket ID: <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;">${r}</code></p>
            <p style="margin:0;color:#1e3a8a;font-size:14px;">Temporary Password / PIN: <code style="background:#fff;padding:2px 8px;border-radius:4px;font-weight:700;letter-spacing:1px;">${o}</code></p>
          </div>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px;">You will be prompted to choose a permanent password upon logging in. Please keep these credentials secure.</p>
          <p style="color:#64748b;font-size:13px;margin:0;">Questions? Contact <a href="mailto:support@ntic.edu.gh" style="color:#4f46e5;">support@ntic.edu.gh</a></p>
        </div>
      </div>`)}static{this.\u0275fac=function(t){return new(t||n)(c(g))}}static{this.\u0275prov=d({token:n,factory:n.\u0275fac,providedIn:"root"})}}return n})();var z=(()=>{class n{constructor(e){this.http=e,this.selfHostedServerUrl=l.textbeltUrl||"http://localhost:9090/text",this.publicHostedUrl="https://textbelt.com/text",this.defaultApiKey="textbelt"}setServerUrl(e){this.selfHostedServerUrl=e}sendSms(e,t,r){let o=r?.isSelfHosted??!0,s=o?this.selfHostedServerUrl:this.publicHostedUrl,i=e.trim();i.startsWith("0")&&i.length===10?i="+233"+i.substring(1):i.startsWith("+")||(i="+"+i);let p={phone:i,number:i,message:t};return o||(p.key=r?.apiKey||this.defaultApiKey),r?.region&&(p.region=r.region),this.http.post(s,p,{context:new b().set(y,!0)}).pipe(h(a=>(a.success?console.log("[Textbelt SMS] Text sent successfully:",a):console.warn("[Textbelt SMS] Warning:",a.error),a)),u(a=>o?(console.warn("[Textbelt SMS] Self-hosted server unreachable. Falling back to public endpoint..."),this.sendSms(e,t,m(f({},r),{isSelfHosted:!1}))):(console.error("[Textbelt SMS] Network error:",a),x({success:!1,error:a?.message||"Network error sending SMS via Textbelt."}))))}sendOtpSms(e,t){let r=`NTIC Competition: Your OTP code is ${t}. Do not share this code.`;return this.sendSms(e,r)}sendCredentialsSms(e,t,r,o){let s=`NTIC Platform: Welcome ${t}! Ticket: ${r}, PIN: ${o}. Log in at https://ntic.edu.gh`;return this.sendSms(e,s)}sendPasswordResetSms(e,t,r,o){let s=`NTIC Platform: Hello ${t}, your password has been reset. Ticket: ${r}, Temporary PIN: ${o}. Log in at https://ntic.edu.gh`;return this.sendSms(e,s)}static{this.\u0275fac=function(t){return new(t||n)(c(g))}}static{this.\u0275prov=d({token:n,factory:n.\u0275fac,providedIn:"root"})}}return n})();export{w as a,z as b};
