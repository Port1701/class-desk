import FormData from 'form-data';
import Mailgun from 'mailgun.js';

// ─── Mailgun Client ──────────────────────────────────────────────────────────
let mailgunClient: InstanceType<typeof Mailgun> | null = null;

const getMailgunClient = (): InstanceType<typeof Mailgun> | null => {
  const apiKey = process.env.MAILGUN_API_KEY ?? '';
  const domain = process.env.MAILGUN_DOMAIN ?? '';

  if (!apiKey || !domain) {
    return null;
  }

  if (!mailgunClient) {
    mailgunClient = new Mailgun(FormData);
  }

  return mailgunClient;
};

/**
 * Send an email via Mailgun. Fire-and-forget — never throws.
 */
export const sendEmail = async (to: string, subject: string, body: string): Promise<void> => {
  const apiKey = process.env.MAILGUN_API_KEY ?? '';
  const domain = process.env.MAILGUN_DOMAIN ?? '';
  const from = process.env.MAILGUN_FROM ?? 'ClassDesk <info@example.org>';

  const mg = getMailgunClient();
  if (!mg || !apiKey || !domain) {
    console.warn('[mailgun] MAILGUN_API_KEY or MAILGUN_DOMAIN not set — skipping email');
    return;
  }

  try {
    const client = mg.client({ username: 'api', key: apiKey });

    const result = await client.messages.create(domain, {
      from,
      to,
      subject,
      text: body,
    });

    console.log(`[mailgun] ✅ Email sent to ${to} (id: ${result.id})`);
  } catch (error) {
    console.error('[mailgun] ❌ Error sending email:', error);
  }
};
