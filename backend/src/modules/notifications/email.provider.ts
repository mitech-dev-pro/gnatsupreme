import { randomUUID } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailResult = {
  providerMessageId: string;
};

export interface EmailProvider {
  send(input: EmailMessage): Promise<EmailResult>;
}

class DevEmailProvider implements EmailProvider {
  async send(input: EmailMessage) {
    logger.info(
      { to: input.to, subject: input.subject, text: input.text },
      "[DEV EMAIL] Would send email",
    );
    return { providerMessageId: `dev-${randomUUID()}` };
  }
}

class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }

  async send(input: EmailMessage) {
    const result = await this.transporter.sendMail({
      from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS! },
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { providerMessageId: result.messageId };
  }
}

export const emailProvider: EmailProvider = (() => {
  if (env.EMAIL_PROVIDER === "DEV") return new DevEmailProvider();
  if (env.EMAIL_PROVIDER === "SMTP") return new SmtpEmailProvider();
  throw new Error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
})();
