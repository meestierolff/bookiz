import { escapeHtml as esc } from '../http.ts';
import type { Account } from './tenants.ts';

/**
 * The few screens Bookiz Cloud has. The assistant is the interface; these
 * pages exist to sign in, connect the assistant, see where you stand and get
 * your data out. They share /site.css with the public site.
 */
function shell(title: string, body: string, nonce: string, options: { signedIn?: boolean } = {}): string {
  const right = options.signedIn
    ? `<form method="post" action="/app/logout"><button class="pill pill-outline" type="submit">Uitloggen</button></form>`
    : `<a class="pill pill-outline" href="/">Terug naar de site</a>`;
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} | Bookiz</title>
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<header class="hdr">
  <div class="hdr-row">
    <a class="brand" href="${options.signedIn ? '/app' : '/'}"><img src="/logo.png" alt="" width="30" height="30"><span>Bookiz</span></a>
    <nav aria-label="Hulp"><a href="/#faq">Vragen</a><a href="/overstappen/">Overstappen</a><a href="mailto:hallo@boekiehouder.nl">Contact</a></nav>
    <div class="hdr-actions">${right}</div>
  </div>
</header>
<main class="app">
${body}
</main>
</body>
</html>`;
}

const errorLine = (error?: string) => (error ? `<p class="error" role="alert">${esc(error)}</p>` : '');

export function loginPage(nonce: string, options: { next: string; error?: string | undefined }): string {
  return shell(
    'Inloggen',
    `<span class="eyebrow">Bookiz Cloud</span>
<h1>Inloggen</h1>
<p>Vul je e-mailadres in. Je krijgt een code per e-mail; een wachtwoord is niet nodig. Heb je nog geen account, dan maken we het meteen aan, met dertig dagen op proef.</p>
${errorLine(options.error)}
<form method="post" action="/app/login" class="card accent">
  <input type="hidden" name="next" value="${esc(options.next)}">
  <label for="email">E-mailadres</label>
  <input class="field" id="email" name="email" type="email" autocomplete="email" required autofocus>
  <button class="plan-btn orange" type="submit">Stuur mij een code <span class="raquo">»</span></button>
</form>
<p class="quiet">Door in te loggen ga je akkoord met de <a href="/voorwaarden/">voorwaarden</a> en de <a href="/privacy/">privacyverklaring</a>.</p>`,
    nonce,
  );
}

export function codePage(nonce: string, options: { email: string; next: string; error?: string | undefined }): string {
  return shell(
    'Code invullen',
    `<span class="eyebrow">Bookiz Cloud</span>
<h1>Kijk in je mailbox</h1>
<p>Als ${esc(options.email)} een geldig adres is, staat daar nu een code van Bookiz. Die is een kwartier geldig.</p>
${errorLine(options.error)}
<form method="post" action="/app/verify" class="card accent">
  <input type="hidden" name="email" value="${esc(options.email)}">
  <input type="hidden" name="next" value="${esc(options.next)}">
  <label for="code">Code</label>
  <input class="field" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required autofocus>
  <button class="plan-btn orange" type="submit">Inloggen <span class="raquo">»</span></button>
</form>
<p class="quiet"><a href="/app/login">Ander e-mailadres of nieuwe code</a></p>`,
    nonce,
  );
}

type Overview = Record<string, any>;

/** Kept in step with web/site.json and the Stripe prices. */
const PRICE = { cloud: 99, dfy: 399 } as const;
const CONTACT = 'hallo@boekiehouder.nl';

const euro = (value: unknown) =>
  typeof value === 'number' ? `€ ${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'onbekend';
const day = (iso: string) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });

export function dashboardPage(
  nonce: string,
  options: {
    account: Account;
    access: boolean;
    /** One of the operator's own accounts: always open. */
    admin?: boolean;
    mcpUrl: string;
    /** Which plans this account can buy now; false while a subscription is running. */
    checkout: { cloud: boolean; dfy: boolean };
    overview: Overview;
    missingReceipts: { ref: string; vendor: string; date: string; link: string | null }[];
    years: number[];
    grants: { clientId: string; name: string; since: string }[];
  },
): string {
  const { account, overview } = options;
  const paid = account.status !== 'trial' && account.paid_until !== null && options.access;
  const planName = account.plan === 'dfy' ? 'Done For You' : 'Abonnement';
  const until = account.paid_until ? esc(day(account.paid_until)) : '';
  const chip = options.admin
    ? '<span class="status-chip">Beheerder: altijd toegang</span>'
    : paid
    ? account.status === 'cancelled'
      ? `<span class="status-chip">Opgezegd: je kunt Bookiz gebruiken tot ${until}</span>`
      : `<span class="status-chip">${planName} loopt tot ${until}</span>`
    : options.access
      ? `<span class="status-chip">Gratis op proef tot ${esc(day(account.trial_ends_at))}</span>`
      : account.status === 'trial'
        ? '<span class="status-chip warn">Proefperiode afgelopen: bekijken en exporteren kan nog, boeken niet</span>'
        : '<span class="status-chip warn">Je abonnement is afgelopen: bekijken en exporteren kan nog, boeken niet</span>';
  const buttons = [
    options.checkout.cloud ? `<a class="plan-btn orange" href="/app/betalen?plan=cloud">Neem Bookiz Cloud, € ${PRICE.cloud} per jaar <span class="raquo">»</span></a>` : '',
    options.checkout.dfy ? `<a class="plan-btn outline" href="/app/betalen?plan=dfy">Kies Done For You, € ${PRICE.dfy} per jaar <span class="raquo">»</span></a>` : '',
  ].join('');
  const subscribe = buttons
    ? `<div class="choice">${buttons}</div>
<p class="quiet">Prijzen exclusief btw.${options.checkout.dfy ? ' Done For You start zodra de samenwerking met een zelfstandige boekhouder rond is; tot die start krijg je op verzoek je hele betaling terug.' : ''}</p>`
    : paid
      ? `${account.plan === 'dfy' ? '<div class="card accent"><p><strong>Done For You staat voor je klaar.</strong> We nemen contact met je op zodra de samenwerking met een zelfstandige boekhouder rond is. Tot die start werkt Bookiz Cloud gewoon en krijg je op verzoek je hele betaling terug.</p></div>' : ''}
<p class="quiet">Wisselen of opzeggen? Mail <a href="mailto:${CONTACT}">${CONTACT}</a> vanaf dit adres.</p>`
      : `<p class="quiet">Opnieuw beginnen of iets regelen rond je abonnement? Mail <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`;

  const isSetUp = overview.setup !== 'nog niet ingericht';
  const btw = overview.btw?.tussenstand_te_betalen;
  const books = isSetUp
    ? `<div class="figures">
  <div><strong>${btw === null || btw === undefined ? 'n.v.t.' : `€ ${btw}`}</strong><span>btw dit tijdvak (${esc(String(overview.btw?.current_period ?? ''))})</span></div>
  <div><strong>${euro(overview.invoices?.unpaid_total)}</strong><span>openstaande facturen (${overview.invoices?.unpaid_count ?? 0})</span></div>
  <div><strong>${overview.year_to_date ? euro(overview.year_to_date.winst) : 'n.v.t.'}</strong><span>winst dit jaar</span></div>
</div>
<div class="card"><span class="eyebrow">Wat er nu te doen is</span><ul class="todo">${(overview.next_actions as string[]).map((action) => `<li>${esc(action)}</li>`).join('')}</ul></div>`
    : '<div class="card"><p>Je administratie is nog leeg. Koppel je assistent en zeg: <strong>“Richt mijn administratie in.”</strong> Stap je over van een ander pakket? Zeg dan erbij per welke datum.</p></div>';

  const receipts =
    options.missingReceipts.length > 0
      ? `<h2>Bonnen die nog ontbreken</h2>
<div class="card"><ul class="todo">${options.missingReceipts
          .map((r) => `<li>${esc(r.ref)}, ${esc(r.vendor)}, ${esc(r.date)}${r.link ? `: <a href="${esc(r.link)}">foto of pdf uploaden</a>` : ''}</li>`)
          .join('')}</ul></div>`
      : '';

  const grants =
    options.grants.length > 0
      ? `<h2>Gekoppelde assistenten</h2>
<div class="card"><ul class="todo">${options.grants
          .map(
            (grant) =>
              `<li>${esc(grant.name)}, sinds ${esc(day(grant.since))} <form method="post" action="/app/revoke" class="inline"><input type="hidden" name="client_id" value="${esc(grant.clientId)}"><button class="linkbutton" type="submit">toegang intrekken</button></form></li>`,
          )
          .join('')}</ul></div>`
      : '';

  return shell(
    'Mijn Bookiz',
    `<span class="eyebrow">Bookiz Cloud</span>
<h1>Mijn Bookiz</h1>
<p class="quiet">Ingelogd als ${esc(account.email)}</p>
${chip}
${subscribe}

<h2>Koppel je AI-assistent</h2>
<p>Bookiz bedien je vanuit de assistent die je al gebruikt. Voeg daar een eigen connector toe (ook wel MCP-server genoemd) met dit adres:</p>
<div class="card accent"><span class="address">${esc(options.mcpUrl)}</span></div>
<div class="card"><ul class="todo">
  <li><strong>Claude:</strong> Instellingen, Connectors, eigen connector toevoegen.</li>
  <li><strong>ChatGPT:</strong> eigen MCP-servers met schrijfrechten staan nu alleen open voor Business, Enterprise en Edu, op het web. Met Pro kan ChatGPT alleen meelezen.</li>
  <li><strong>Grok:</strong> grok.com/connectors, nieuwe connector, Custom.</li>
  <li><strong>Claude Code:</strong> <code>claude mcp add --transport http bookiz ${esc(options.mcpUrl)}</code></li>
</ul></div>
<p class="quiet">Je assistent vraagt je daarna om in te loggen met dit e-mailadres en om toestemming te geven. De menu’s van de assistenten veranderen geregeld; zoek op “connector” of “MCP” als het er anders uitziet.</p>
${grants}

<h2>Je administratie</h2>
${books}
${receipts}

<h2>Je gegevens meenemen</h2>
<p><strong>Voor je boekhouder:</strong> een Excel-bestand met een tab Inkomsten (elke factuurregel) en een tab Uitgaven (elke bon), met datums, btw-tarief, bedragen excl. en incl. btw. De kolommen tellen op tot de cijfers in je jaaroverzicht.</p>
${options.years
  .map(
    (year) => `<div class="choice"><a class="plan-btn orange" href="/app/export?year=${year}&amp;format=xlsx">Excel ${year}</a><a class="plan-btn outline" href="/app/export?year=${year}&amp;format=csv&amp;tab=inkomsten">CSV inkomsten ${year}</a><a class="plan-btn outline" href="/app/export?year=${year}&amp;format=csv&amp;tab=uitgaven">CSV uitgaven ${year}</a></div>`,
  )
  .join('')}
<p class="quiet"><strong>Als back-up of om te vertrekken:</strong> alles van één jaar in één bestand, met aangiftes en het jaaroverzicht. Bewaar het; je moet je administratie zeven jaar kunnen tonen.</p>
<div class="choice">${options.years.map((year) => `<a class="plan-btn outline" href="/app/export?year=${year}">Volledige export ${year} (JSON)</a>`).join('')}</div>`,
    nonce,
    { signedIn: true },
  );
}

export function consentPage(
  nonce: string,
  options: { authorizationId: string; clientName: string; returnTo: { host: string; known: boolean; local: boolean }; email: string },
): string {
  const where = options.returnTo.local
    ? `een programma op je eigen computer (<strong>${esc(options.returnTo.host)}</strong>)`
    : `<strong>${esc(options.returnTo.host)}</strong>`;
  const caution = options.returnTo.known || options.returnTo.local
    ? ''
    : `<p class="error" role="alert">Let op: ${esc(options.returnTo.host)} is geen adres van een assistent die wij kennen. De naam hierboven heeft deze toepassing zelf opgegeven. Ga alleen door als je zeker weet van wie dit adres is.</p>`;
  return shell(
    'Toegang geven',
    `<span class="eyebrow">Assistent koppelen</span>
<h1>Toegang geven tot je administratie</h1>
<p>Een toepassing die zich <strong>${esc(options.clientName)}</strong> noemt wil namens jou (${esc(options.email)}) met Bookiz werken.</p>
${caution}
<div class="card">
  <p>Als je toestemming geeft, kan deze toepassing:</p>
  <ul class="todo">
    <li>je administratie inzien: facturen, uitgaven, relaties en aangiftes;</li>
    <li>boeken: facturen maken en definitief maken, uitgaven en bonnen vastleggen;</li>
    <li>op jouw verzoek facturen per e-mail versturen en een btw-tijdvak afsluiten.</li>
  </ul>
  <p class="quiet">De toegang gaat naar ${where}. Geef alleen toestemming als je zojuist zelf Bookiz aan het koppelen was in je assistent. Kreeg je deze pagina via een link van iemand anders, weiger dan. Je kunt de toegang later intrekken op Mijn Bookiz.</p>
</div>
<form method="post" action="/oauth/consent" class="choice">
  <input type="hidden" name="authorization_id" value="${esc(options.authorizationId)}">
  <button class="plan-btn orange" type="submit" name="decision" value="approve">Toestemming geven</button>
  <button class="plan-btn outline" type="submit" name="decision" value="deny">Weigeren</button>
</form>`,
    nonce,
  );
}

/** After the decision: take the browser back to the assistant. */
export function forwardPage(nonce: string, target: string, host: string): string {
  return shell(
    'Terug naar je assistent',
    `<h1>Je gaat terug naar je assistent</h1>
<p>Gebeurt er niets? <a id="go" href="${esc(target)}">Ga verder naar ${esc(host)}</a>.</p>
<script nonce="${nonce}">location.replace(document.getElementById('go').href);</script>`,
    nonce,
  );
}

export function messagePage(nonce: string, title: string, text: string): string {
  return shell(title, `<h1>${esc(title)}</h1>\n<p>${esc(text)}</p>\n<div class="choice"><a class="plan-btn outline" href="/app">Naar Mijn Bookiz</a></div>`, nonce);
}

export function loginMail(code: string): { subject: string; text: string } {
  return {
    subject: `${code} is je inlogcode voor Bookiz`,
    text: [
      `Je inlogcode voor Bookiz is: ${code}`,
      '',
      'De code is een kwartier geldig. Heb je niet zelf geprobeerd in te loggen, dan kun je deze e-mail negeren.',
      '',
      'Bookiz zal je nooit om deze code vragen via telefoon of chat.',
    ].join('\n'),
  };
}
