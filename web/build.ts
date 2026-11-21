import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type RuleKey, type RuleSet, rulesFor } from '../src/rules.ts';
import { landingBody, landingData, landingFaq } from './landing.ts';
import { type Company, privacy, terms, who } from './legal.ts';
import { costBody, costFaq, type MoneybirdFacts, moneybirdBody, moneybirdFaq, yearEndBody } from './guides.ts';
import { CHECKED_ON } from './sources.ts';
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
  cloud: { price_year_excl: number; trial_days: number; open: boolean };
  /** `open`: Done For You can be paid for (through sign-in and Stripe); otherwise it is a free reservation by mail. */
  dfy: { price_year_excl: number; founding_price_year_excl: number; founding_seats: number; open: boolean };
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
      ${site.cloud.open ? '<a class="pill pill-orange" href="/app">Start gratis <span class="raquo">»</span></a>' : `<a class="pill pill-orange" href="${at('prijzen')}">Begin voor € 0 <span class="raquo">»</span></a>`}
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
        <div><h3>Product</h3><a href="${at('agents')}">Agents</a><a href="${at('live')}">Demo</a><a href="${at('prijzen')}">Prijzen</a><a href="/goedkoop-boekhoudprogramma-zzp/">Wat het kost</a></div>
        <div><h3>Overstappen</h3><a href="/overstappen/">Wanneer en hoe</a><a href="/overstappen/moneybird/">Van Moneybird</a><a href="/jaarafsluiting/">Jaarafsluiting</a></div>
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
<meta property="og:image" content="${site.site_url}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Bookiz: boekhouden voor zzp’ers met weinig facturen, via je eigen AI-assistent">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0d0d0d">
<link rel="stylesheet" href="/site.css">
${(options.jsonLd ?? []).map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`).join('\n')}
${options.data ? `<script type="application/json" id="bz-data">${options.data}</script>` : ''}
<script src="/site.js" defer></script>
<script src="/_vercel/insights/script.js" defer></script>
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
    dfy: { price: site.dfy.price_year_excl, founding: site.dfy.founding_price_year_excl, seats: site.dfy.founding_seats, open: site.dfy.open },
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
      { '@context': 'https://schema.org', ...ORGANIZATION },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Bookiz',
        url: `${site.site_url}/`,
        inLanguage: 'nl',
        publisher: { '@id': ORGANIZATION['@id'] },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Bookiz',
        publisher: { '@id': ORGANIZATION['@id'] },
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        inLanguage: 'nl',
        description: 'Open-source boekhouding voor Nederlandse eenmanszaken met weinig facturen, te bedienen via een AI-assistent met MCP.',
        offers: [
          { '@type': 'Offer', name: 'Self-host', price: '0', priceCurrency: 'EUR' },
          { '@type': 'Offer', name: 'Cloud', price: String(site.cloud.price_year_excl), priceCurrency: 'EUR', description: 'Per jaar, exclusief btw' },
          ...(site.dfy.open
            ? [
                {
                  '@type': 'Offer',
                  name: 'Done For You',
                  price: String(site.dfy.founding_price_year_excl),
                  priceCurrency: 'EUR',
                  description: 'Founding-prijs per jaar, exclusief btw. Start zodra de samenwerking met een zelfstandige boekhouder rond is.',
                  availability: 'https://schema.org/PreOrder',
                },
              ]
            : []),
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
    description: `De bedragen van ${YEAR} voor zzp’ers en eenmanszaken: KOR-grens, zelfstandigenaftrek, MKB-winstvrijstelling, KIA en meer, elk met het citaat van de Belastingdienst.`,
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

/** The publisher of every page, so search and answer engines see one consistent entity. */
const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${site.site_url}/#organization`,
  name: company.name,
  legalName: company.legal_name,
  url: `${site.site_url}/`,
  logo: `${site.site_url}/icon-512.png`,
  email: company.email,
  ...(company.vat_id ? { vatID: company.vat_id } : {}),
  sameAs: site.repo_url ? [site.repo_url] : [],
};

/**
 * A guide: a visible breadcrumb trail and an "updated" date, with structured
 * data that says no more than the page shows (Article, BreadcrumbList, and
 * FAQPage only when the questions are on the page).
 */
function guidePage(options: {
  path: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  body: string;
  crumbs: [label: string, path: string][];
  faqs?: [string, string][];
  extraJsonLd?: unknown[];
}): string {
  const trail = [['Bookiz', '/'] as [string, string], ...options.crumbs];
  const crumbs = trail
    .map(([label, path], i) => (i === trail.length - 1 ? `<span aria-current="page">${esc(label)}</span>` : `<a href="${esc(path)}">${esc(label)}</a>`))
    .join(' <span aria-hidden="true">›</span> ');
  const faqHtml = options.faqs
    ? `\n  <h2>Veelgestelde vragen</h2>\n${options.faqs.map(([question, answer]) => `  <h3>${esc(question)}</h3>\n  <p>${esc(answer)}</p>`).join('\n')}`
    : '';
  return page({
    path: options.path,
    title: options.title,
    description: options.description,
    body: `<main class="doc prose">
  <nav class="crumbs" aria-label="Kruimelpad">${crumbs}</nav>
  <h1>${esc(options.h1)}</h1>
  <p class="lead">${esc(options.lead)}</p>
  <p class="updated">Bijgewerkt op <time datetime="${CHECKED_ON}">${dutchDate(CHECKED_ON)}</time></p>
${options.body}${faqHtml}
  <p class="note-line"><a href="/#prijzen">Bekijk wat Bookiz kost</a>${site.repo_url ? ` of <a href="${esc(site.repo_url)}">host het zelf, gratis</a>` : ''}.</p>
</main>`,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: options.h1,
        description: options.description,
        inLanguage: 'nl',
        mainEntityOfPage: `${site.site_url}${options.path}`,
        dateModified: CHECKED_ON,
        author: { '@id': ORGANIZATION['@id'] },
        publisher: ORGANIZATION,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map(([label, path], i) => ({ '@type': 'ListItem', position: i + 1, name: label, item: `${site.site_url}${path}` })),
      },
      ...(options.faqs
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: options.faqs.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })),
            },
          ]
        : []),
      ...(options.extraJsonLd ?? []),
    ],
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

/** A rule a guide cites. The build stops if the year has no such rule, rather than print a wrong amount. */
function cited<K extends RuleKey>(key: K): NonNullable<RuleSet['rules'][K]> {
  const rule = rules.rules[key];
  if (!rule) throw new Error(`rules/nl-${YEAR}.json has no rule "${key}", which a guide cites`);
  return rule as NonNullable<RuleSet['rules'][K]>;
}

const GUIDES = ['/overstappen/', '/overstappen/moneybird/', '/jaarafsluiting/', '/goedkoop-boekhoudprogramma-zzp/'];
const kiaTable = cited('kia').value as { to: number; kind: string }[];
const KIA_FROM = (kiaTable.find((band) => band.kind === 'none')?.to ?? 0);

const extraPages: Record<string, string> = {
  privacy: legalPage(
    '/privacy/',
    'Privacyverklaring',
    'Welke gegevens Bookiz vastlegt, waarom, waar ze staan en welke rechten je hebt.',
    'Kort: de website volgt je niet, je bonnen bewaren wij niet, en je administratie staat in de Europese Unie.',
    privacy(company),
  ),
  overstappen: (() => {
    const facts: SwitchFacts = { retentionYears: rules.rules.bewaarplicht_jaren.value, cloudPrice: site.cloud.price_year_excl, repoUrl: site.repo_url };
    return guidePage({
      path: '/overstappen/',
      title: 'Overstappen van boekhoudprogramma: per 1 januari of per kwartaal | Bookiz',
      description:
        'Wanneer stap je als zzp’er het makkelijkst over van boekhoudpakket? Per 1 januari, of in het voorjaar per 1 april. Wat je meeneemt en hoe het in vijf stappen gaat.',
      h1: 'Overstappen van boekhoudprogramma',
      lead: 'Voor zzp’ers en eenmanszaken met een kleine administratie. Het beste moment is 1 januari, het op één na beste het begin van een btw-kwartaal, zoals 1 april. Wat neem je mee, wat laat je achter, en in welke volgorde.',
      body: switchBody(facts, esc),
      crumbs: [['Overstappen', '/overstappen/']],
      faqs: switchFaq(facts),
      extraJsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Overstappen van boekhoudprogramma',
          inLanguage: 'nl',
          step: [
            'Exporteer je oude administratie en bewaar die zeven jaar.',
            'Doe je laatste btw-aangifte vanuit je oude pakket.',
            'Schrijf op welke facturen nog openstaan, welke bedrijfsmiddelen je nog afschrijft en wat je laatste factuurnummer is.',
            'Koppel je assistent aan Bookiz en laat je klanten, openstaande facturen en bedrijfsmiddelen overnemen.',
            'Controleer het openstaande bedrag en zeg dan pas je oude pakket op.',
          ].map((text, index) => ({ '@type': 'HowToStep', position: index + 1, text })),
        },
      ],
    });
  })(),
  'overstappen/moneybird': (() => {
    const facts: MoneybirdFacts = {
      retentionYears: rules.rules.bewaarplicht_jaren.value,
      cloudPrice: site.cloud.price_year_excl,
      trialDays: site.cloud.trial_days,
      korOmzetgrens: euro(rules.rules.kor_omzetgrens.value),
    };
    return guidePage({
      path: '/overstappen/moneybird/',
      title: 'Moneybird opzeggen en overstappen bij weinig facturen | Bookiz',
      description:
        'Een alternatief voor Moneybird als je weinig factureert. Maak eerst een jaarexport, zeg dan pas op, en zet je klanten en open facturen over naar Bookiz.',
      h1: 'Overstappen van Moneybird naar Bookiz',
      lead: 'Maak eerst een jaarexport van elk boekjaar in Moneybird, zet je klanten en openstaande facturen over naar Bookiz, en zeg Moneybird pas op als de bedragen kloppen. Veertien dagen na de einddatum van je abonnement verwijdert Moneybird je administratie, dus je back-up moet er vóór die tijd zijn.',
      body: moneybirdBody(facts, esc),
      crumbs: [
        ['Overstappen', '/overstappen/'],
        ['Van Moneybird', '/overstappen/moneybird/'],
      ],
      faqs: moneybirdFaq(facts),
    });
  })(),
  'goedkoop-boekhoudprogramma-zzp': guidePage({
    path: '/goedkoop-boekhoudprogramma-zzp/',
    title: `Goedkoop boekhoudprogramma: € 0 of ${euro(site.cloud.price_year_excl)} per jaar | Bookiz`,
    description: `Bookiz kost € 0 zelf gehost of ${euro(site.cloud.price_year_excl)} per jaar in de cloud, zonder kosten per factuur. Waar je op let, wat je verder nodig hebt en wat er niet in zit.`,
    h1: 'Een goedkoop boekhoudprogramma voor zzp’ers met weinig facturen',
    lead: `Bookiz kost € 0 als je het zelf host en ${euro(site.cloud.price_year_excl)} per jaar exclusief btw als wij het hosten, ofwel ${euro(site.cloud.price_year_excl / 12)} per maand. Er zijn geen kosten per factuur. Daarnaast heb je een AI-assistent nodig; met Claude kan dat op het gratis abonnement, dat één eigen connector toestaat.`,
    body: costBody(
      {
        cloudYear: euro(site.cloud.price_year_excl),
        cloudYearIncl: euro(inclVat(site.cloud.price_year_excl)),
        cloudMonth: euro(site.cloud.price_year_excl / 12),
        trialDays: site.cloud.trial_days,
        dfy: site.dfy.open ? { year: euro(site.dfy.founding_price_year_excl), yearIncl: euro(inclVat(site.dfy.founding_price_year_excl)) } : null,
        repoUrl: site.repo_url,
      },
      esc,
    ),
    crumbs: [['Wat het kost', '/goedkoop-boekhoudprogramma-zzp/']],
    faqs: costFaq({
      cloudYear: euro(site.cloud.price_year_excl),
      cloudYearIncl: euro(inclVat(site.cloud.price_year_excl)),
      cloudMonth: euro(site.cloud.price_year_excl / 12),
      trialDays: site.cloud.trial_days,
      dfy: null,
      repoUrl: site.repo_url,
    }),
  }),
  jaarafsluiting: guidePage({
    path: '/jaarafsluiting/',
    title: `Jaarafsluiting voor zzp’ers: checklist voor december en januari | Bookiz`,
    description: `Je boekjaar afsluiten als zzp’er: wat vóór 31 december moet, de btw-aangifte in januari en je aangifte inkomstenbelasting. Met de bedragen van ${YEAR} en hun bron.`,
    h1: 'Je boekjaar afsluiten als zzp’er',
    lead: 'In december rond je af wat nog bij het oude jaar hoort. In januari doe je de btw-aangifte over het vierde kwartaal: aangifte én betaling moeten uiterlijk 31 januari binnen zijn. Daarna volgt je aangifte inkomstenbelasting, vaak vóór 1 mei.',
    body: yearEndBody(
      {
        year: YEAR,
        rulesPath: `/belastingregels-${YEAR}/`,
        urencriterium: rules.rules.urencriterium.value,
        zelfstandigenaftrek: euro(cited('zelfstandigenaftrek').value),
        startersaftrek: euro(cited('startersaftrek').value),
        mkbWinstvrijstelling: `${cited('mkb_winstvrijstelling').value.toLocaleString('nl-NL')}%`,
        investeringDrempel: euro(rules.rules.investering_drempel.value),
        kiaVanaf: euro(KIA_FROM),
        korOmzetgrens: euro(rules.rules.kor_omzetgrens.value),
        bewaarplichtJaren: rules.rules.bewaarplicht_jaren.value,
      },
      esc,
    ),
    crumbs: [['Jaarafsluiting', '/jaarafsluiting/']],
  }),
  voorwaarden: legalPage(
    '/voorwaarden/',
    'Algemene voorwaarden',
    'De afspraken voor het gebruik van Bookiz Cloud: wat je mag verwachten, wat het kost en hoe je opzegt.',
    'Kort: Bookiz rekent en bewaart, jij blijft verantwoordelijk voor je administratie en je aangiftes, en je kunt altijd met al je gegevens weg.',
    terms(company, { cloud: site.cloud.price_year_excl, dfy: site.dfy.open ? site.dfy.founding_price_year_excl : null }),
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
// favicon.ico and the 48px-multiple PNGs are what Google's favicon service (and so Claude's connector list) picks up.
const ICONS = ['favicon.ico', 'favicon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const INDEXNOW_KEYS = readdirSync(join(here, 'assets')).filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
for (const file of ['site.css', 'site.js', 'logo.png', 'og.png', ...ICONS, 'founder.jpg', 'founder-sm.jpg', ...INDEXNOW_KEYS]) {
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
    .map((path) => {
      // Only pages with a known date of their last material change get a lastmod.
      const lastmod = GUIDES.includes(path) ? CHECKED_ON : path === `/belastingregels-${YEAR}/` ? rules.checked_on : null;
      return `  <url><loc>${site.site_url}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(dist, 'llms.txt'),
  `# Bookiz

> Open-source boekhouding voor Nederlandse eenmanszaken met weinig facturen. Geen eigen chatbot: de gebruiker bedient Bookiz via een eigen AI-assistent over MCP (Claude, ChatGPT en andere). Zelf hosten is gratis; Bookiz Cloud kost € ${site.cloud.price_year_excl} per jaar exclusief btw. Bookiz rekent volgens de regels van de Belastingdienst, met bron, maar dient geen aangiftes in en is geen belastingadvies.

## Product

- [Wat Bookiz doet en kost](${site.site_url}/)
- [Belastingregels ${YEAR} voor eenmanszaken, met bron](${site.site_url}/belastingregels-${YEAR}/)
- [Wat Bookiz kost, en wat je daarnaast nodig hebt](${site.site_url}/goedkoop-boekhoudprogramma-zzp/)
${site.repo_url ? `- [Broncode en installatie](${site.repo_url})\n` : ''}
## Overstappen

- [Overstappen van boekhoudprogramma: per 1 januari, per kwartaal of nu](${site.site_url}/overstappen/): welk moment het makkelijkst is, wat je meeneemt en wat je bewaart.
- [Overstappen van Moneybird naar Bookiz](${site.site_url}/overstappen/moneybird/): jaarexport maken, wat er na opzeggen gebeurt, klanten en openstaande facturen overzetten.
- [Je boekjaar afsluiten als zzp'er](${site.site_url}/jaarafsluiting/): wat vóór 31 december moet, de btw-aangifte in januari en de aangifte inkomstenbelasting.
`,
);

console.log(`web/dist built: ${2 + Object.keys(extraPages).length} pages, ${Object.keys(rules.rules).length} rules for ${YEAR}`);
for (const warning of warnings) console.warn(`  note: ${warning}`);
