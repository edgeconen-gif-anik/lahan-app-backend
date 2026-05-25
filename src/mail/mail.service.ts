import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const service = process.env.SMTP_SERVICE;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;
    const port = Number(process.env.SMTP_PORT || 587);
    const connectionTimeout = Number(
      process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000,
    );
    const greetingTimeout = Number(
      process.env.SMTP_GREETING_TIMEOUT_MS || 10000,
    );
    const socketTimeout = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000);
    const secure =
      process.env.SMTP_SECURE === 'true' ||
      Number(process.env.SMTP_PORT) === 465;

    this.from =
      process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      (user ? `"Lahan Project Management" <${user}>` : 'no-reply@lahan.local');

    if ((host || service) && user && pass) {
      this.transporter = nodemailer.createTransport({
        ...(service ? { service } : { host, port, secure }),
        auth: {
          user,
          pass,
        },
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
      });
    } else {
      this.logger.warn(
        'SMTP email is not configured. Password reset links will be written to the server log.',
      );
    }
  }

  get isConfigured() {
    return Boolean(this.transporter);
  }

  async sendPasswordResetEmail({
    to,
    resetUrl,
    expiresInMinutes,
  }: PasswordResetEmailInput) {
    const subject = 'Reset your Lahan Project password';
    const text = [
      'A password reset was requested for your Lahan Project account.',
      '',
      `Open this link within ${expiresInMinutes} minutes:`,
      resetUrl,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 12px;">Reset your password</h2>
        <p>A password reset was requested for your Lahan Project account.</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 14px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
            Reset password
          </a>
        </p>
        <p>This link expires in ${expiresInMinutes} minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `;

    if (!this.transporter) {
      this.logger.warn(`Password reset link for ${to}: ${resetUrl}`);
      return false;
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });

    this.logger.log(`Password reset email sent to ${to}`);
    return true;
  }
}
