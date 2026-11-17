import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RuleKey, type RuleSet, rulesFor } from '../src/rules.ts';
import { landingBody, landingData, landingFaq } from './landing.ts';
import { type Company, privacy, terms, who } from './legal.ts';
import { switchBody, switchFaq, type SwitchFacts } from './switch.ts';

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
  company: { name: string; legal_name: string; legal_form: string; kvk: string; vat_id: string; address: string };
  /** `open` goes true once sign-in mail works; until then the site does not invite anyone to sign up. */
  cloud: { price_year_excl: number; trial_days: number; stripe_link: string; open: boolean };
  dfy: { price_year_excl: number; founding_price_year_excl: number; founding_seats: number; stripe_link: string };
};

const YEAR = 2026;
const warnings: string[] = [];
const company: Company = { ...site.company, email: site.contact_email };
if (!company.vat_id) warnings.push('company.vat_id is empty in web/site.json: the footer and legal pages show no btw-id');
const rules: RuleSet = rulesFor(YEAR);

const esc = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string);
const euro = (amount: number) =>
  `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
const inclVat = (amount: number) => Math.round(amount * (100 + rules.rules.btw_tarief_hoog.value)) / 100;
const dutchDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

function ruleValue(key: RuleKey): string {
  const rule = rules.rules[key];
  if (!rule) return '';
  if (typeof rule.value === 'boolean') return rule.value ? 'ja' : 'nee';
  if (typeof rule.value !== 'number') return 'tabel, zie citaat';
  const unit = rule.unit ?? '';
  if (unit.startsWith('EUR')) return `${euro(rule.value)}${unit.slice(3)}`;
  return `${rule.value.toLocaleString('nl-NL')}${unit === '%' ? '%' : ` ${unit}`}`.trim();
}

const GITHUB_ICON = '<img src="/logos/github-white.svg" alt="">';

function header(onHome: boolean): string {
  const at = (anchor: string) => (onHome ? `#${anchor}` : `/#${anchor}`);
  return `<header class="hdr">
  <div class="hdr-row">
    <a class="brand" href="${onHome ? '#top' : '/'}"><img src="/logo.png" alt="" width="30" height="30"><span>Bookiz</span></a>
    <nav aria-label="Hoofdmenu">
      <a href="${at('agents')}">Agents</a>
      <a href="${at('live')}">Demo</a>
      <a href="${at('voorwie')}">Voor wie</a>
      <a href="/overstappen/">Overstappen</a>
      <a href="${at('prijzen')}">Prijzen</a>
      <a href="${at('faq')}">FAQ</a>
      ${site.cloud.open ? '<a href="/app">Inloggen</a>' : ''}
    </nav>
    <div class="hdr-actions">
      <a class="pill pill-outline" href="${esc(site.repo_url)}">${GITHUB_ICON}GitHub</a>
      <a class="pill pill-orange" href="${at('prijzen')}">Begin voor € 0 <span class="raquo">»</span></a>
    </div>
  </div>
</header>`;
}

function footer(onHome: boolean): string {
  const at = (anchor: string) => (onHome ? `#${anchor}` : `/#${anchor}`);
  const legal = [
    esc(who(company)),
    company.address && esc(company.address),
    company.kvk && `KvK ${esc(company.kvk)}`,
    company.vat_id && `btw-id ${esc(company.vat_id)}`,
    `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>`,
  ]
    .filter(Boolean)
    .join(' · ');
  return `<footer class="ftr">
  <div class="ftr-inner">
    <div class="ftr-top">
      <div class="ftr-about">
        <a class="brand" href="${onHome ? '#top' : '/'}"><img src="/logo.png" alt="" width="34" height="34"><span>Bookiz</span></a>
        <p>Boekhouding voor eenmanszaken met weinig facturen. Je praat met je assistent, Bookiz houdt de boeken bij.</p>
      </div>
      <div class="ftr-cols">
        <div><h3>Product</h3><a href="${at('agents')}">Agents</a><a href="${at('live')}">Demo</a><a href="${at('prijzen')}">Prijzen</a><a href="/overstappen/">Overstappen</a></div>
        <div><h3>Open source</h3><a href="${esc(site.repo_url)}">GitHub</a><a href="/belastingregels-${YEAR}/">Belastingregels ${YEAR}</a><a href="${esc(site.repo_url)}/issues">Fout melden</a></div>
        <div><h3>Bookiz</h3><a href="${at('founder')}">Over de maker</a><a href="${at('faq')}">FAQ</a><a href="/privacy/">Privacy</a><a href="/voorwaarden/">Voorwaarden</a></div>
      </div>
    </div>
    <div class="ftr-big" aria-hidden="true">Bookiz</div>
    <div class="ftr-legal">
      <p>Bookiz rekent. Het doet geen aangifte voor je en is geen belastingadvies. Regels voor ${YEAR} voor het laatst met de bron vergeleken op ${dutchDate(rules.checked_on)}. Versie 0.1.<br>${legal}</p>
      <span>Engine AGPL-3.0 · Regels MIT · Gemaakt in Nederland</span>
    </div>
  </div>
</footer>`;
}

function page(options: { path: string; title: string; description: string; body: string; jsonLd?: unknown[]; data?: string }): string {
  const url = `${site.site_url}${options.path}`;
  const onHome = options.path === '/';
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
<meta property="og:image" content="${site.site_url}/logo.png">
<link rel="preload" href="/fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" type="image/png" href="/favicon.png">
<meta name="theme-color" content="#0d0d0d">
<link rel="stylesheet" href="/site.css">
${(options.jsonLd ?? []).map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`).join('\n')}
${options.data ? `<script type="application/json" id="bz-data">${options.data}</script>` : ''}
<script src="/site.js" defer></script>
</head>
<body>
${header(onHome)}
${options.body}
${footer(onHome)}
</body>
</html>
`;
}

function home(): string {
  const body = landingBody({
    esc,
    euro,
    repoUrl: site.repo_url,
    contactEmail: site.contact_email,
    cloud: { open: site.cloud.open, priceYear: site.cloud.price_year_excl, trialDays: site.cloud.trial_days },
    dfy: { price: site.dfy.price_year_excl, founding: site.dfy.founding_price_year_excl, seats: site.dfy.founding_seats },
    rulesYear: YEAR,
    zelfstandigenaftrek: rules.rules.zelfstandigenaftrek?.value ?? 0,
    korLimit: rules.rules.kor_omzetgrens.value,
  });
  return page({
    path: '/',
    title: 'Bookiz: boekhouden voor zzp’ers met weinig facturen',
    description:
      'Open-source boekhouding voor eenmanszaken met weinig facturen. Facturen, bonnen en btw-aangifte regel je in een chat met je eigen AI-assistent. Gratis zelf te hosten.',
    body,
    data: landingData(),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Bookiz',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        inLanguage: 'nl',
        description: 'Open-source boekhouding voor Nederlandse eenmanszaken met weinig facturen, te bedienen via een AI-assistent met MCP.',
        offers: [
          { '@type': 'Offer', name: 'Self-host', price: '0', priceCurrency: 'EUR' },
          { '@type': 'Offer', name: 'Cloud', price: String(site.cloud.price_year_excl), priceCurrency: 'EUR', description: 'Per jaar, exclusief btw' },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: landingFaq.map(([question, answer]) => ({
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
    body: `<main class="doc">
  <h1>Belastingregels ${YEAR} voor eenmanszaken</h1>
  <p class="lead">Dit zijn de ${Object.keys(rules.rules).length} regels waarmee Bookiz voor ${YEAR} rekent. Bij elke regel staat de zin van de Belastingdienst waar het bedrag uit komt. Voor het laatst met de bron vergeleken op ${dutchDate(rules.checked_on)}.</p>
  <table class="rules">
    <thead><tr><th scope="col">Regel</th><th scope="col">${YEAR}</th><th scope="col">Wat de bron zegt</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p class="after">Dezelfde regels staan als bestand in de repository onder <code>rules/nl-${YEAR}.json</code>. Zie je een fout, meld het daar.</p>
</main>`,
  });
}

function legalPage(path: string, title: string, description: string, lead: string, html: string): string {
  return page({
    path,
    title: `${title} | Bookiz`,
    description,
    body: `<main class="doc prose">
  <h1>${title}</h1>
  <p class="lead">${lead}</p>
${html}
  <p class="note-line">Versie van ${dutchDate(new Date().toISOString().slice(0, 10))}.</p>
</main>`,
  });
}

const extraPages: Record<string, string> = {
  privacy: legalPage(
    '/privacy/',
    'Privacyverklaring',
    'Welke gegevens Bookiz vastlegt, waarom, waar ze staan en welke rechten je hebt.',
    'Kort: de website volgt je niet, je bonnen bewaren wij niet, en je administratie staat in de Europese Unie.',
    privacy(company),
  ),
  overstappen: (() => {
    const facts: SwitchFacts = {
      retentionYears: rules.rules.bewaarplicht_jaren.value,
      cloudPrice: site.cloud.price_year_excl,
      q4Deadline: '31 januari',
      repoUrl: site.repo_url,
    };
    const faqs = switchFaq(facts);
    return page({
      path: '/overstappen/',
      title: 'Overstappen van boekhoudprogramma per 1 januari | Bookiz',
      description:
        'Overstappen van boekhoudpakket als zzp’er: waarom 1 januari het beste moment is, wat je meeneemt, wat je bewaart en hoe het in vijf stappen gaat. Ook vanuit Moneybird.',
      body: `<main class="doc prose">
  <h1>Overstappen van boekhoudprogramma per 1 januari</h1>
  <p class="lead">Voor zzp’ers en eenmanszaken met een kleine administratie. Wat neem je mee, wat laat je achter, en in welke volgorde.</p>
${switchBody(facts)}
  <h2>Veelgestelde vragen</h2>
${faqs.map(([question, answer]) => `  <h3>${esc(question)}</h3>\n  <p>${esc(answer)}</p>`).join('\n')}
  <p class="note-line"><a href="/#prijzen">Bekijk wat Bookiz kost</a>${site.repo_url ? ` of <a href="${esc(site.repo_url)}">host het zelf, gratis</a>` : ''}.</p>
</main>`,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Overstappen van boekhoudprogramma per 1 januari',
          inLanguage: 'nl',
          step: [
            'Exporteer je oude administratie en bewaar die zeven jaar.',
            'Doe je laatste btw-aangifte vanuit je oude pakket.',
            'Schrijf op welke facturen nog openstaan en welke bedrijfsmiddelen je nog afschrijft.',
            'Koppel je assistent aan Bookiz en laat je klanten, openstaande facturen en bedrijfsmiddelen overnemen.',
            'Controleer het openstaande bedrag en zeg dan pas je oude pakket op.',
          ].map((text, index) => ({ '@type': 'HowToStep', position: index + 1, text })),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })),
        },
      ],
    });
  })(),
  voorwaarden: legalPage(
    '/voorwaarden/',
    'Algemene voorwaarden',
    'De afspraken voor het gebruik van Bookiz Cloud: wat je mag verwachten, wat het kost en hoe je opzegt.',
    'Kort: Bookiz rekent en bewaart, jij blijft verantwoordelijk voor je administratie en je aangiftes, en je kunt altijd met al je gegevens weg.',
    terms(company, site.cloud.price_year_excl),
  ),
};
if (!company.kvk || !company.address) {
  warnings.push('company.kvk and company.address are empty in web/site.json: the legal pages and footer show only the name and e-mail address');
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'fonts'), { recursive: true });
mkdirSync(join(dist, `belastingregels-${YEAR}`), { recursive: true });

writeFileSync(join(dist, 'index.html'), home());
writeFileSync(join(dist, `belastingregels-${YEAR}`, 'index.html'), rulesPage());
for (const [slug, html] of Object.entries(extraPages)) {
  mkdirSync(join(dist, slug), { recursive: true });
  writeFileSync(join(dist, slug, 'index.html'), html);
}
for (const file of ['site.css', 'site.js', 'logo.png', 'favicon.png', 'founder.jpg', 'founder-sm.jpg']) {
  copyFileSync(join(here, 'assets', file), join(dist, file));
}
mkdirSync(join(dist, 'logos'), { recursive: true });
for (const file of readdirSync(join(here, 'assets', 'logos'))) copyFileSync(join(here, 'assets', 'logos', file), join(dist, 'logos', file));
for (const [name, file] of [
  ['geist', 'geist/files/geist-latin-wght-normal.woff2'],
  ['geist-mono', 'geist-mono/files/geist-mono-latin-wght-normal.woff2'],
]) {
  copyFileSync(join(root, 'node_modules/@fontsource-variable', file as string), join(dist, 'fonts', `${name}.woff2`));
}
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
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', `/belastingregels-${YEAR}/`, ...Object.keys(extraPages).map((slug) => `/${slug}/`)]
    .map((path) => `  <url><loc>${site.site_url}${path}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(dist, 'llms.txt'),
  `# Bookiz\n\n> Open-source boekhouding voor Nederlandse eenmanszaken met weinig facturen. Geen eigen chatbot: de gebruiker bedient Bookiz via een eigen AI-assistent over MCP. Bookiz dient geen aangiftes in bij de Belastingdienst.\n\n- [Wat Bookiz doet en kost](${site.site_url}/)\n- [Belastingregels ${YEAR} voor eenmanszaken, met bron](${site.site_url}/belastingregels-${YEAR}/)\n- [Overstappen van boekhoudprogramma per 1 januari](${site.site_url}/overstappen/)\n${site.repo_url ? `- [Broncode](${site.repo_url})\n` : ''}`,
);

console.log(`web/dist built: ${2 + Object.keys(extraPages).length} pages, ${Object.keys(rules.rules).length} rules for ${YEAR}`);
for (const warning of warnings) console.warn(`  note: ${warning}`);
