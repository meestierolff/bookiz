import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RuleKey, type RuleSet, rulesFor } from '../src/rules.ts';

/**
 * Builds the static site into web/dist. Prices, payment links and the tax
 * figures on the page come from web/site.json and /rules, so the site cannot
 * drift from what the engine calculates with.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(here, 'dist');
const site = JSON.parse(readFileSync(join(here, 'site.json'), 'utf8')) as {
  site_url: string;
  repo_url: string;
  contact_email: string;
  cloud: { price_year_excl: number; stripe_link: string };
  dfy: { price_year_excl: number; founding_price_year_excl: number; founding_seats: number; stripe_link: string };
};

const YEAR = 2026;
const rules: RuleSet = rulesFor(YEAR);
const warnings: string[] = [];

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string);
const euro = (amount: number) =>
  `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
const inclVat = (amount: number) => Math.round(amount * (100 + rules.rules.btw_tarief_hoog.value)) / 100;
const dutchDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

function payButton(link: string, label: string, name: string): string {
  if (!/^https:\/\/\S+$/.test(link)) {
    warnings.push(`${name}: no payment link in web/site.json, the button shows "Voorverkoop opent binnenkort"`);
    return '<span class="button waiting">Voorverkoop opent binnenkort</span>';
  }
  return `<a class="button pay" href="${esc(link)}">${label}</a>`;
}

function ruleValue(key: RuleKey): string {
  const rule = rules.rules[key];
  if (!rule) return '';
  if (typeof rule.value === 'boolean') return rule.value ? 'ja' : 'nee';
  if (typeof rule.value !== 'number') return 'tabel, zie citaat';
  const unit = rule.unit ?? '';
  if (unit.startsWith('EUR')) return `${euro(rule.value)}${unit.slice(3)}`;
  return `${rule.value.toLocaleString('nl-NL')}${unit === '%' ? '%' : ` ${unit}`}`.trim();
}

const faq: [string, string][] = [
  [
    'Heb ik een AI-assistent nodig?',
    'Ja. Bookiz heeft geen eigen chatbot en verkoopt geen AI-tegoed. Je gebruikt de assistent die je al hebt, zolang die MCP ondersteunt, de standaard waarmee assistenten met andere software praten.',
  ],
  [
    'Dient Bookiz mijn btw-aangifte in?',
    'Nee. Bookiz rekent de bedragen per rubriek uit, in hele euro’s, met erbij welke facturen en bonnen erachter zitten. Jij neemt ze over in Mijn Belastingdienst Zakelijk. Bij Done for you doet een boekhouder de aangiftes voor je.',
  ],
  [
    'Waar blijven mijn bonnen?',
    'Bij jou. Bookiz mailt elke bon naar je eigen mailbox, of zet hem in een map als je zelf host, en bewaart zelf alleen een controlegetal waarmee je kunt aantonen dat het bestand niet is veranderd. Je moet bonnen zeven jaar bewaren, dus gooi die e-mails niet weg.',
  ],
  [
    'Ik doe mee aan de kleineondernemersregeling. Werkt dit dan ook?',
    `Ja. Je facturen gaan zonder btw de deur uit, je kosten tellen inclusief btw en Bookiz houdt je omzet bij tegen de grens van ${euro(rules.rules.kor_omzetgrens.value)}. Een factuur waarmee je over de grens gaat, houdt Bookiz tegen.`,
  ],
  [
    'Is dit belastingadvies?',
    'Nee. Bookiz rekent volgens de regels die de Belastingdienst publiceert en laat bij elk bedrag de bron zien. Het weet niets van je partner, je hypotheek of je spaargeld. Voor advies ga je naar een boekhouder.',
  ],
  [
    'Wat als ik wil stoppen?',
    'Dan vraag je je assistent om een export. Je krijgt alle facturen, uitgaven, aangiftes en het jaaroverzicht in één bestand. De software is open source, dus je kunt haar ook zelf blijven draaien.',
  ],
  [
    'Wat betekent voorverkoop?',
    'Cloud en Done for you zijn er nog niet. De gratis versie die je zelf host wel. Wie vooruit betaalt, laat zien dat er vraag is en krijgt als eerste toegang. Je abonnementsjaar begint pas op de dag dat je toegang krijgt, en tot die dag krijg je je geld terug als je je bedenkt.',
  ],
];

const highlighted: RuleKey[] = [
  'kor_omzetgrens',
  'zelfstandigenaftrek',
  'mkb_winstvrijstelling',
  'investering_drempel',
  'kilometervergoeding',
  'beperkt_aftrekbaar_pct',
];

function page(options: { path: string; title: string; description: string; body: string; jsonLd?: unknown[] }): string {
  const url = `${site.site_url}${options.path}`;
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(options.title)}</title>
<meta name="description" content="${esc(options.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="nl_NL">
<meta property="og:title" content="${esc(options.title)}">
<meta property="og:description" content="${esc(options.description)}">
<meta property="og:url" content="${esc(url)}">
<link rel="preload" href="/fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" type="image/png" href="/favicon.png">
<meta name="theme-color" content="#0d0d0d">
<link rel="stylesheet" href="/site.css">
${(options.jsonLd ?? []).map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<header class="wrap top">
  <a class="brand" href="/"><img src="/logo.png" alt="" width="34" height="34">Bookiz</a>
  <nav aria-label="Hoofdmenu">
    <a href="/#prijzen">Prijzen</a>
    <a href="/belastingregels-${YEAR}/">Regels ${YEAR}</a>
    ${site.repo_url ? `<a href="${esc(site.repo_url)}">GitHub</a>` : ''}
  </nav>
</header>
${options.body}
<footer class="wrap foot">
  <p>Bookiz is software, geen belastingadviseur. De berekeningen volgen de openbare regels in de repository; controleer ze voordat je aangifte doet.</p>
  <p>Regels voor ${YEAR} voor het laatst met de bron vergeleken op ${dutchDate(rules.checked_on)}. Broncode onder AGPL-3.0, de regels onder MIT.${site.contact_email ? ` Vragen: <a href="mailto:${esc(site.contact_email)}">${esc(site.contact_email)}</a>.` : ''}</p>
</footer>
</body>
</html>
`;
}

function home(): string {
  const cloudIncl = inclVat(site.cloud.price_year_excl);
  const foundingIncl = inclVat(site.dfy.founding_price_year_excl);
  const repoButton = site.repo_url
    ? `<a class="button" href="${esc(site.repo_url)}">Zelf hosten, gratis</a>`
    : '<span class="button waiting">Repository volgt</span>';
  if (!site.repo_url) warnings.push('repo_url is empty in web/site.json: the self-host buttons show "Repository volgt"');

  const body = `<main>
<section class="wrap hero">
  <img class="mark" src="/logo.png" alt="" width="641" height="641">
  <h1>Boekhouden voor wie weinig factureert.</h1>
  <p class="lead">Een handvol facturen per jaar, een stapel bonnen en vier keer btw-aangifte. Bookiz houdt het bij terwijl je er met je eigen AI-assistent over praat. Open source, en elke belastingregel met de bron erbij.</p>
  <div class="actions">${repoButton}<a class="button ghost" href="#prijzen">Of laat het ons hosten</a></div>
</section>

<section class="wrap sheet-wrap">
  <div class="sheet" aria-label="Voorbeeld van een kwartaal in Bookiz">
    <h2>Kasboek, vierde kwartaal ${YEAR}</h2>
    <table>
      <thead><tr><th>Datum</th><th>Wat</th><th class="num">Bedrag</th><th class="num">Btw</th></tr></thead>
      <tbody>
        <tr><td>2 nov</td><td class="what">Factuur 2026-001, tien uur advies</td><td class="num">1.028,50</td><td class="num">178,50</td></tr>
        <tr><td>3 nov</td><td class="what">Kantoorhandel</td><td class="num">−121,00</td><td class="num">−21,00</td></tr>
        <tr><td>4 nov</td><td class="what">Software uit Ierland, btw verlegd</td><td class="num">−100,00</td><td class="num">0,00</td></tr>
        <tr><td>5 nov</td><td class="what">Lunch met klant, privé betaald</td><td class="num">−54,50</td><td class="num">geen aftrek</td></tr>
      </tbody>
      <tfoot><tr><td colspan="3">Btw te betalen, vóór 31 januari</td><td class="num">€ 157</td></tr></tfoot>
    </table>
    <p class="said">“Hier is de bon van de lunch, die heb ik zelf voorgeschoten.” Meer hoef je niet te zeggen.</p>
  </div>
</section>

<section class="band raised">
  <div class="wrap">
    <h2>Zo werkt het</h2>
    <ol class="steps">
      <li><h3>Koppel je assistent</h3><p>Bookiz is een MCP-server. Je voegt hem één keer toe aan Claude, ChatGPT, Codex of een andere assistent die MCP ondersteunt.</p></li>
      <li><h3>Zeg wat er gebeurd is</h3><p>Stuur een foto van een bon of vraag om een factuur voor tien uur advies. Je assistent leest mee, Bookiz boekt en bewaart het bewijsstuk.</p></li>
      <li><h3>Neem de cijfers over</h3><p>Elk kwartaal staan de bedragen per rubriek klaar, met de deadline erbij. Je typt ze over in Mijn Belastingdienst Zakelijk.</p></li>
    </ol>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>Gemaakt voor een kleine administratie</h2>
    <p class="intro">Je hebt een eenmanszaak, misschien naast een baan. Je levert diensten, stuurt een paar facturen per maand of per jaar, en wilt er zo min mogelijk tijd aan kwijt zijn.</p>
    <div class="split">
      <div>
        <h3>Wat Bookiz doet</h3>
        <ul>
          <li>Facturen met alle verplichte gegevens, als pdf en per e-mail</li>
          <li>Bonnen en inkoopfacturen, ook als je privé hebt betaald</li>
          <li>Btw-aangifte per rubriek, of de KOR zonder btw</li>
          <li>Buitenlandse abonnementen waarbij de btw naar jou is verlegd</li>
          <li>Investeringen met afschrijving, en kilometers met je eigen auto</li>
          <li>Jaaroverzicht met je winst en wat je opzij moet zetten</li>
          <li>Een volledige export, wanneer je maar wilt</li>
        </ul>
      </div>
      <div class="not">
        <h3>Wat Bookiz bewust niet doet</h3>
        <ul>
          <li>Bankkoppeling</li>
          <li>Offertes en urenregistratie</li>
          <li>Voorraad</li>
          <li>Personeel en loon</li>
          <li>Een eigen chatbot met AI-tegoed</li>
          <li>Zelf indienen bij de Belastingdienst</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="band raised">
  <div class="wrap">
    <h2>De regels liggen op tafel</h2>
    <p class="intro">Elk bedrag waarmee Bookiz rekent staat in een open bestand, met de pagina van de Belastingdienst waar het vandaan komt en de zin waarin het staat. Je boekhouder kan meelezen, en een fout is voor iedereen zichtbaar.</p>
    <table class="rules">
      <thead><tr><th scope="col">Regel</th><th scope="col">${YEAR}</th><th scope="col">Bron</th></tr></thead>
      <tbody>
${highlighted
  .map((key) => {
    const rule = rules.rules[key];
    if (!rule) return '';
    return `        <tr><th scope="row">${esc(rule.title)}</th><td class="value">${esc(ruleValue(key))}</td><td><a href="${esc(rule.source)}" rel="noopener">belastingdienst.nl</a></td></tr>`;
  })
  .join('\n')}
      </tbody>
    </table>
    <p class="after-table"><a href="/belastingregels-${YEAR}/">Alle ${Object.keys(rules.rules).length} regels voor ${YEAR}, met het citaat uit de bron</a></p>
  </div>
</section>

<section class="band" id="prijzen">
  <div class="wrap">
    <h2>Gratis als je zelf host. Betaald als je gemak wilt.</h2>
    <div class="plans">
      <div class="plan">
        <h3>Zelf hosten</h3>
        <p class="price">€ 0</p>
        <p class="incl">Open source, voor altijd</p>
        <p class="what">De hele boekhouding op je eigen computer of server.</p>
        <ul>
          <li>Alle functies, geen limiet op facturen</li>
          <li>Eigen database, of geen database nodig</li>
          <li>Bonnen in je eigen map of mailbox</li>
        </ul>
        ${repoButton}
        <p class="small"></p>
      </div>
      <div class="plan featured">
        <h3>Cloud <span class="presale">voorverkoop</span></h3>
        <p class="price">${euro(site.cloud.price_year_excl)} <small>per jaar</small></p>
        <p class="incl">${euro(cloudIncl)} inclusief btw</p>
        <p class="what">Wij hosten het. Jij koppelt alleen je assistent.</p>
        <ul>
          <li>Hosting en dagelijkse back-ups</li>
          <li>Facturen versturen vanaf een betrouwbaar adres</li>
          <li>Bonnen bewaren door ze te mailen of te uploaden</li>
        </ul>
        ${payButton(site.cloud.stripe_link, 'Bestel Cloud vooruit', 'Cloud')}
        <p class="small">Cloud is nog niet beschikbaar. Je jaar begint op de dag dat je toegang krijgt; tot die dag krijg je je geld terug als je je bedenkt.</p>
      </div>
      <div class="plan">
        <h3>Done for you <span class="presale">voorverkoop</span></h3>
        <p class="price">${euro(site.dfy.founding_price_year_excl)} <small>per jaar</small></p>
        <p class="incl">${euro(foundingIncl)} inclusief btw, voor de eerste ${site.dfy.founding_seats} klanten. Daarna ${euro(site.dfy.price_year_excl)}.</p>
        <p class="what">Cloud, plus een boekhouder die je aangiftes doet.</p>
        <ul>
          <li>Vier btw-aangiftes per jaar</li>
          <li>Je aangifte inkomstenbelasting</li>
          <li>Alles van Cloud</li>
        </ul>
        ${payButton(site.dfy.stripe_link, 'Reserveer Done for you', 'Done for you')}
        <p class="small">Nog niet beschikbaar. De aangiftes worden gedaan door een zelfstandige boekhouder. We starten zodra die samenwerking rond is; tot die dag krijg je je geld terug als je je bedenkt.</p>
      </div>
    </div>
  </div>
</section>

<section class="band raised">
  <div class="wrap">
    <h2>Vragen</h2>
    <div class="faq">
${faq.map(([question, answer]) => `      <details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join('\n')}
    </div>
  </div>
</section>
</main>`;

  return page({
    path: '/',
    title: 'Bookiz: boekhouden voor zzp’ers met weinig facturen',
    description:
      'Open-source boekhouding voor eenmanszaken met weinig facturen. Facturen, bonnen en btw-aangifte regel je via je eigen AI-assistent. Gratis zelf te hosten.',
    body,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Bookiz',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        inLanguage: 'nl',
        description: 'Open-source boekhouding voor Nederlandse eenmanszaken met weinig facturen, te bedienen via een AI-assistent met MCP.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: 'Zelf hosten' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  });
}

function rulesPage(): string {
  const rows = (Object.keys(rules.rules) as RuleKey[])
    .map((key) => {
      const rule = rules.rules[key];
      if (!rule) return '';
      return `      <tr id="${key}">
        <th scope="row">${esc(rule.title)}</th>
        <td class="value">${esc(ruleValue(key))}</td>
        <td><blockquote cite="${esc(rule.source)}">“${esc(rule.quote)}”</blockquote>${rule.note ? `<p class="note">${esc(rule.note)}</p>` : ''}<p class="note"><a href="${esc(rule.source)}" rel="noopener">Bron: ${esc(new URL(rule.source).hostname.replace(/^www\./, ''))}</a></p></td>
      </tr>`;
    })
    .join('\n');
  return page({
    path: `/belastingregels-${YEAR}/`,
    title: `Belastingregels ${YEAR} voor eenmanszaken, met bron | Bookiz`,
    description: `De bedragen en percentages van ${YEAR} voor zzp’ers en eenmanszaken: KOR-grens, zelfstandigenaftrek, MKB-winstvrijstelling, KIA en meer, elk met het citaat van de Belastingdienst.`,
    body: `<main class="wrap doc">
  <h1>Belastingregels ${YEAR} voor eenmanszaken</h1>
  <p class="lead">Dit zijn de ${Object.keys(rules.rules).length} regels waarmee Bookiz voor ${YEAR} rekent. Bij elke regel staat de zin van de Belastingdienst waar het bedrag uit komt. Voor het laatst met de bron vergeleken op ${dutchDate(rules.checked_on)}.</p>
  <table class="rules">
    <thead><tr><th scope="col">Regel</th><th scope="col">${YEAR}</th><th scope="col">Wat de bron zegt</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p class="after-table">Dezelfde regels staan als bestand in de repository onder <code>rules/nl-${YEAR}.json</code>. Zie je een fout, meld het daar.</p>
</main>`,
  });
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'fonts'), { recursive: true });
mkdirSync(join(dist, `belastingregels-${YEAR}`), { recursive: true });

writeFileSync(join(dist, 'index.html'), home());
writeFileSync(join(dist, `belastingregels-${YEAR}`, 'index.html'), rulesPage());
for (const file of ['site.css', 'logo.png', 'favicon.png']) copyFileSync(join(here, 'assets', file), join(dist, file));
copyFileSync(
  join(root, 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2'),
  join(dist, 'fonts', 'bricolage-grotesque.woff2'),
);
copyFileSync(
  join(root, 'node_modules/@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2'),
  join(dist, 'fonts', 'caveat.woff2'),
);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.site_url}/sitemap.xml\n`);
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', `/belastingregels-${YEAR}/`]
    .map((path) => `  <url><loc>${site.site_url}${path}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(dist, 'llms.txt'),
  `# Bookiz\n\n> Open-source boekhouding voor Nederlandse eenmanszaken met weinig facturen. Geen eigen chatbot: de gebruiker bedient Bookiz via een eigen AI-assistent over MCP. Bookiz dient geen aangiftes in bij de Belastingdienst.\n\n- [Wat Bookiz doet en kost](${site.site_url}/)\n- [Belastingregels ${YEAR} voor eenmanszaken, met bron](${site.site_url}/belastingregels-${YEAR}/)\n${site.repo_url ? `- [Broncode](${site.repo_url})\n` : ''}`,
);

console.log(`web/dist built: 2 pages, ${Object.keys(rules.rules).length} rules for ${YEAR}`);
for (const warning of warnings) console.warn(`  note: ${warning}`);
