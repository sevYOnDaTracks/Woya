import { Injectable } from '@angular/core';

interface EmailOptions {
  to?: string | null;
  subject: string;
  body: string;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly endpoint = 'https://smtpjs.com/v3/smtpjs.aspx?';
  private readonly fromAddress = 'no-reply@woya.shop';
  private readonly host = 'smtp.hostinger.com';
  private readonly username = 'no-reply@woya.shop';
  private readonly password = 'Rennes*12301';

  async send(options: EmailOptions) {
    if (!options.to || typeof window === 'undefined' || typeof fetch === 'undefined') {
      return;
    }

    const payload = {
      Host: this.host,
      Username: this.username,
      Password: this.password,
      To: options.to,
      From: this.fromAddress,
      Subject: options.subject,
      Body: options.body,
    };

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn('EmailService: unable to send email', error);
    }
  }
}
