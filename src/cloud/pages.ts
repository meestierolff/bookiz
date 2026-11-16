import { escapeHtml as esc } from '../http.ts';
import type { Account } from './tenants.ts';

/**
 * The few screens Bookiz Cloud has. The assistant is the interface; these
 * pages exist to sign in, connect the assistant, see where you stand and get
 * your data out.
 */
function shell(title: string, body: string, nonce: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} | Bookiz</title>
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="stylesheet" href="/site.css">
<style nonce="${nonce}">
  .app { max-width: 46rem; padding-top: 1.5rem; padding-bottom: 5rem; }
  .app h1 { font-size: clamp(2rem, 5vw, 3rem); }
  .app h2 { font-size: 1.5rem; margin-top: 3rem; }
  .app p, .app li { color: var(--soft); }
  .app p { margin-top: 0.8rem; }
  .card { background: var(--raised); border: 1px solid var(--line); border-radius: 1.1rem; padding: 1.4rem 1.5rem; margin-top: 1.25rem; }
  .card.accent { border-color: var(--orange); }
  .field { display: block; width: 100%; font: inherit; color: var(--white); background: var(--black); border: 1.5px solid #555; border-radius: 0.7rem; padding: 0.8rem 1rem; margin-top: 0.6rem; }
  .field:focus-visible { outline: 3px solid var(--orange); outline-offset: 2px; }
  label { font-weight: 600; color: var(--white); }
  form .button { margin-top: 1.1rem; cursor: pointer; font: inherit; font-weight: 600; }
  .address { font-size: 1.15rem; font-weight: 600; color: var(--white); word-break: break-all; user-select: all; }
  .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1rem; margin-top: 1.25rem; }
  .figures div { background: var(--raised); border: 1px solid var(--line); border-radius: 1rem; padding: 1rem 1.2rem; }
  .figures strong { display: block; font-size: 1.6rem; color: var(--white); letter-spacing: -0.02em; }
  .figures span { font-size: 0.95rem; color: var(--soft); }
  .todo { padding-left: 1.2rem; margin-top: 0.8rem; }
  .todo li { margin-bottom: 0.45rem; }
  .todo li::marker { color: var(--orange); }
  .quiet { font-size: 0.95rem; }
  .linkbutton { background: none; border: 0; padding: 0; color: var(--orange-soft); font: inherit; text-decoration: underline; cursor: pointer; }
  .error { color: #ff9b7a; font-weight: 600; }
  .inline { display: inline; margin-left: 0.4rem; }
</style>
</head>
<body>
<header class="wrap top">
  <a class="brand" href="/"><img src="/logo.png" alt="" width="34" height="34">Bookiz</a>
</header>
<main class="wrap app">
${body}
</main>
</body>
</html>`;
}

export function loginPage(nonce: string, options: { next: string; error?: string | undefined }): string {
  return shell(
    'Inloggen',
    `<h1>Inloggen</h1>
<p>Vul je e-mailadres in. Je krijgt een code per e-mail; een wachtwoord is niet nodig. Heb je nog geen account, dan maken we het meteen aan, met dertig dagen op proef.</p>
${options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : ''}
<form method="post" action="/app/login" class="card">
  <input type="hidden" name="next" value="${esc(options.next)}">
  <label for="email">E-mailadres</label>
  <input class="field" id="email" name="email" type="email" autocomplete="email" required autofocus>
  <button class="button" type="submit">Stuur mij een code</button>
</form>
<p class="quiet">Door in te loggen ga je akkoord met de <a href="/voorwaarden/">voorwaarden</a> en de <a href="/privacy/">privacyverklaring</a>.</p>`,
    nonce,
  );
}

export function codePage(nonce: string, options: { email: string; next: string; error?: string | undefined }): string {
  return shell(
    'Code invullen',
    `<h1>Kijk in je mailbox</h1>
<p>Als ${esc(options.email)} een geldig adres is, staat daar nu een code van Bookiz. Die is een kwartier geldig.</p>
${options.error ? `<p class="error" role="alert">${esc(options.error)}</p>` : ''}
<form method="post" action="/app/verify" class="card">
  <input type="hidden" name="email" value="${esc(options.email)}">
  <input type="hidden" name="next" value="${esc(options.next)}">
  <label for="code">Code</label>
  <input class="field" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required autofocus>
  <button class="button" type="submit">Inloggen</button>
</form>
<p class="quiet"><a href="/app/login">Ander e-mailadres of nieuwe code</a></p>`,
    nonce,
  );
}

type Overview = Record<string, any>;

const euro = (value: unknown) =>
  typeof value === 'number' ? `€ ${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'onbekend';
const day = (iso: string) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });

export function dashboardPage(
  nonce: string,
  options: {
    account: Account;
    access: boolean;
    mcpUrl: string;
    subscribeUrl: string | null;
    overview: Overview;
    missingReceipts: { ref: string; vendor: string; date: string; link: string | null }[];
    years: number[];
    grants: { clientId: string; name: string; since: string }[];
  },
): string {
  const { account, overview } = options;
  const paid = account.status === 'active' && account.paid_until;
  const status = paid
    ? `Je abonnement loopt tot ${day(account.paid_until as string)}.`
    : options.access
      ? `Je probeert Bookiz Cloud gratis tot ${day(account.trial_ends_at)}.`
      : 'Je proefperiode is afgelopen. Bekijken en exporteren kan nog; boeken niet.';
  const subscribe =
    !paid && options.subscribeUrl
      ? `<p><a class="button pay" href="${esc(options.subscribeUrl)}">Neem Bookiz Cloud, € 99 per jaar</a></p>`
      : '';

  const isSetUp = overview.setup !== 'nog niet ingericht';
  const books = isSetUp
    ? `<div class="figures">
  <div><strong>${overview.btw?.tussenstand_te_betalen === null || overview.btw?.tussenstand_te_betalen === undefined ? 'n.v.t.' : `€ ${overview.btw.tussenstand_te_betalen}`}</strong><span>btw dit tijdvak (${esc(String(overview.btw?.current_period ?? ''))})</span></div>
  <div><strong>${euro(overview.invoices?.unpaid_total)}</strong><span>openstaande facturen (${overview.invoices?.unpaid_count ?? 0})</span></div>
  <div><strong>${overview.year_to_date ? euro(overview.year_to_date.winst) : 'n.v.t.'}</strong><span>winst dit jaar</span></div>
</div>
<ul class="todo">${(overview.next_actions as string[]).map((action) => `<li>${esc(action)}</li>`).join('')}</ul>`
    : '<p>Je administratie is nog leeg. Koppel je assistent en zeg: <strong>“Richt mijn administratie in.”</strong></p>';

  const receipts =
    options.missingReceipts.length > 0
      ? `<h2>Bonnen die nog ontbreken</h2>
<ul class="todo">${options.missingReceipts
          .map((r) => `<li>${esc(r.ref)}, ${esc(r.vendor)}, ${esc(r.date)}${r.link ? `: <a href="${esc(r.link)}">foto of pdf uploaden</a>` : ''}</li>`)
          .join('')}</ul>`
      : '';

  return shell(
    'Mijn Bookiz',
    `<h1>Mijn Bookiz</h1>
<p>${esc(account.email)}. ${esc(status)}</p>
${subscribe}

<h2>Koppel je AI-assistent</h2>
<p>Bookiz bedien je vanuit de assistent die je al gebruikt. Voeg daar een eigen connector toe (ook wel MCP-server genoemd) met dit adres:</p>
<div class="card accent"><span class="address">${esc(options.mcpUrl)}</span></div>
<ul class="todo">
  <li><strong>Claude:</strong> Instellingen, Connectors, eigen connector toevoegen.</li>
  <li><strong>ChatGPT:</strong> eigen MCP-servers met schrijfrechten staan nu alleen open voor Business, Enterprise en Edu, op het web. Met Pro kan ChatGPT alleen meelezen.</li>
  <li><strong>Grok:</strong> grok.com/connectors, nieuwe connector, Custom.</li>
  <li><strong>Claude Code:</strong> <code>claude mcp add --transport http bookiz ${esc(options.mcpUrl)}</code></li>
</ul>
<p class="quiet">Je assistent vraagt je daarna om in te loggen met dit e-mailadres en om toestemming te geven. De menu’s van de assistenten veranderen geregeld; zoek op “connector” of “MCP” als het er anders uitziet.</p>

${
  options.grants.length > 0
    ? `<h2>Gekoppelde assistenten</h2>
<ul class="todo">${options.grants
        .map(
          (grant) =>
            `<li>${esc(grant.name)}, sinds ${esc(day(grant.since))} <form method="post" action="/app/revoke" class="inline"><input type="hidden" name="client_id" value="${esc(grant.clientId)}"><button class="linkbutton" type="submit">toegang intrekken</button></form></li>`,
        )
        .join('')}</ul>`
    : ''
}

<h2>Je administratie</h2>
${books}
${receipts}

<h2>Je gegevens meenemen</h2>
<p>Alles van één jaar in één bestand: facturen, uitgaven, aangiftes en het jaaroverzicht. Bewaar het; je moet je administratie zeven jaar kunnen tonen.</p>
<p>${options.years.map((year) => `<a href="/app/export?year=${year}">Export ${year}</a>`).join(' · ')}</p>

<form method="post" action="/app/logout"><p class="quiet"><button class="linkbutton" type="submit">Uitloggen</button></p></form>`,
    nonce,
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
    `<h1>Toegang geven tot je administratie</h1>
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
<form method="post" action="/oauth/consent">
  <input type="hidden" name="authorization_id" value="${esc(options.authorizationId)}">
  <button class="button pay" type="submit" name="decision" value="approve">Toestemming geven</button>
  <button class="button ghost" type="submit" name="decision" value="deny">Weigeren</button>
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
  return shell(title, `<h1>${esc(title)}</h1>\n<p>${esc(text)}</p>\n<p><a href="/app">Naar Mijn Bookiz</a></p>`, nonce);
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
