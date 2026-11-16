/**
 * Bookiz Cloud: the hosted, multi-customer way to run the same engine.
 * Supabase provides Postgres, accounts and the OAuth server; this process
 * holds no state between requests.
 */
export type CloudEnv = {
  publicUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  databaseUrl: string;
  /** Signs receipt and invoice links. Never leaves the server. */
  linkSecret: string;
  smtpUrl: string | undefined;
  mailFrom: string | undefined;
  stripeWebhookSecret: string | undefined;
  stripePaymentLink: string | undefined;
  /** Id (plink_…) of the one payment link that buys Bookiz Cloud; other payments in the same Stripe account do not count. */
  stripePaymentLinkId: string | undefined;
  /** Lets the operator ask the health check how the deployment is configured. */
  operatorToken: string | undefined;
  trialDays: number;
};

const REQUIRED = [
  'PUBLIC_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'BOOKIZ_LINK_SECRET',
] as const;

export function loadCloudEnv(env: NodeJS.ProcessEnv = process.env): CloudEnv {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Bookiz Cloud is not configured: missing ${missing.join(', ')}`);
  const value = (name: (typeof REQUIRED)[number]) => (env[name] as string).trim();
  return {
    publicUrl: value('PUBLIC_URL').replace(/\/+$/, ''),
    supabaseUrl: value('SUPABASE_URL').replace(/\/+$/, ''),
    supabasePublishableKey: value('SUPABASE_PUBLISHABLE_KEY'),
    supabaseSecretKey: value('SUPABASE_SECRET_KEY'),
    databaseUrl: value('DATABASE_URL'),
    linkSecret: value('BOOKIZ_LINK_SECRET'),
    smtpUrl: env.SMTP_URL?.trim() || undefined,
    mailFrom: env.MAIL_FROM?.trim() || undefined,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    stripePaymentLink: env.STRIPE_PAYMENT_LINK?.trim() || undefined,
    stripePaymentLinkId: env.STRIPE_PAYMENT_LINK_ID?.trim() || undefined,
    operatorToken: env.OPERATOR_TOKEN?.trim() || undefined,
    trialDays: 30,
  };
}
