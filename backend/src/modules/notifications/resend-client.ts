import { Resend, type EmailApiOptions } from 'resend';

import env from '../../config/env';

export type SendEmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
};

export interface ResendEmailClient {
  readonly mode: 'live' | 'fallback';
  sendEmail(payload: SendEmailPayload): Promise<{ id: string | null }>;
}

class ResendSdkClient implements ResendEmailClient {
  readonly mode = 'live' as const;
  constructor(private readonly client: Resend) {}

  async sendEmail(payload: SendEmailPayload): Promise<{ id: string | null }> {
    const options: EmailApiOptions = {
      from: payload.from ?? 'BioHax <notifications@biohax.app>',
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      headers: payload.headers,
      tags: payload.tags
    };

    if (payload.replyTo) {
      options.reply_to = payload.replyTo;
    }

    const response = await this.client.emails.send(options as unknown as Parameters<Resend['emails']['send']>[0]);

    const data = (response as { data?: { id?: string | null } | null }).data;
    const id = data && typeof data.id === 'string' ? data.id : null;

    return { id };
  }
}

class FallbackResendClient implements ResendEmailClient {
  readonly mode = 'fallback' as const;
  constructor(private readonly logger: Pick<Console, 'warn'> = console) {}

  async sendEmail(payload: SendEmailPayload): Promise<{ id: string | null }> {
    this.logger.warn?.('[notifications] Resend API key not configured; logging email instead', {
      to: payload.to,
      subject: payload.subject
    });
    return { id: null };
  }
}

export const createResendClient = (
  apiKey: string | undefined = env.RESEND_API_KEY,
  logger: Pick<Console, 'warn'> = console
): ResendEmailClient => {
  if (!apiKey) {
    return new FallbackResendClient(logger);
  }

  return new ResendSdkClient(new Resend(apiKey));
};

export const resendEmailClient = createResendClient();
