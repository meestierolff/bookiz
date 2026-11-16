import type { Config } from './config.ts';
import { BookizError } from './errors.ts';

export type Attachment = { filename: string; content: Buffer; contentType: string };

export type Mail = {
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments: Attachment[];
};

export type Mailer = (mail: Mail) => Promise<{ messageId: string }>;

/** SMTP only: works with Brevo, any other provider, or your own mail server. */
export function createMailer(config: Config): Mailer {
  return async (mail) => {
    if (!config.smtpUrl || !config.mailFrom) {
      throw new BookizError(
        'E-mail is niet ingesteld op deze server.',
        'Zet SMTP_URL en MAIL_FROM in de omgeving, bijvoorbeeld met de SMTP-gegevens van Brevo.',
      );
    }
    const { createTransport } = await import('nodemailer');
    const info = await createTransport(config.smtpUrl).sendMail({ from: config.mailFrom, ...mail });
    return { messageId: String(info.messageId) };
  };
}
