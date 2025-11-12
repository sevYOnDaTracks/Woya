import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

interface EmailOptions {
  to?: string | null;
  subject: string;
  body: string;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly baseUrl = environment.functionsBaseUrl?.replace(/\/$/, '') || '';

  async send(options: EmailOptions) {
    if (!options.to || !this.baseUrl || typeof fetch === 'undefined') {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/sendEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          html: this.toHtml(options.body),
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      console.warn('EmailService: unable to send email', error);
      return false;
    }
  }

  private toHtml(body: string) {
    if (!body) return '';
    return body.replace(/\n/g, '<br>');
  }
}
