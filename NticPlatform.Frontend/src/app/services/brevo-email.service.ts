import { Injectable } from '@angular/core';
import { EmailService } from './email.service';

/**
 * @deprecated Use `EmailService` from `./email.service` instead.
 * Brevo direct integration has been decommissioned; outbound mail is handled
 * by the backend SMTP service.
 */
@Injectable({ providedIn: 'root' })
export class BrevoEmailService extends EmailService {}
export { EmailService };
