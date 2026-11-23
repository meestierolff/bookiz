import { COMPETITOR_PRICES, PRICES_CHECKED_ON, DEADLINES, SOURCES, sourceList } from './sources.ts';

/**
 * Two guides that sit under the switching hub: leaving Moneybird, and closing
 * the year. Amounts come from /rules (passed in), deadlines and Moneybird's
 * own procedures from ./sources.ts. Nothing here is tax advice, and the pages
 * say so.
 */
type Esc = (value: string) => string;

export type YearEndFacts = {
  year: number;
  rulesPath: string;
  urencriterium: number;
  zelfstandigenaftrek: string;
  startersaftrek: string;
  mkbWinstvrijstelling: string;
  investeringDrempel: string;
  kiaVanaf: string;
  korOmzetgrens: string;
  bewaarplichtJaren: number;
};

export function yearEndBody(f: YearEndFacts, esc: Esc): string {
  const rule = (key: string, label: string) => `<a href="${f.rulesPath}#${key}">${label}</a>`;
  return `
  <h2>Vóór 31 december</h2>
  <ol>
    <li><strong>Verstuur de facturen voor werk van dit jaar.</strong> Dan staan omzet en btw in het jaar en kwartaal waarin je het werk deed, en hoef je in januari niets terug te zoeken.</li>
    <li><strong>Maak je bonnen compleet.</strong> Zoek ontbrekende bonnen en inkoopfacturen op. Bookiz laat zien welke uitgaven nog geen bon hebben.</li>
    <li><strong>Boek investeringen als investering.</strong> Een bedrijfsmiddel van ${f.investeringDrempel} of meer schrijf je af; daaronder trek je het in één keer af als kosten. Investeer je in een jaar in totaal meer dan ${f.kiaVanaf}, dan kan de ${rule('kia', 'kleinschaligheidsinvesteringsaftrek')} gelden. Bookiz past beide toe als je de aankoop als investering boekt.</li>
    <li><strong>Tel je uren.</strong> Besteed je in het kalenderjaar minstens ${f.urencriterium.toLocaleString('nl-NL')} uur aan je onderneming, dan haal je het ${rule('urencriterium', 'urencriterium')}. Dat is een voorwaarde voor de zelfstandigenaftrek van ${f.zelfstandigenaftrek} en, als starter, de startersaftrek van ${f.startersaftrek}. Ben je geen starter, dan moet je ook meer tijd aan je onderneming besteden dan aan ander werk. Bookiz telt geen uren: je geeft zelf op of je het criterium haalt.</li>
    <li><strong>Beslis over de kleineondernemersregeling voor volgend jaar.</strong> Wil je per 1 januari met de KOR beginnen of stoppen, dan moet je aanmelding of afmelding uiterlijk ${DEADLINES.korWeeks} weken vóór de ingangsdatum binnen zijn bij de Belastingdienst. Voor 1 januari is dat begin december. De KOR kan alleen als je omzet in het jaar van aanmelding en het jaar ervoor niet boven ${f.korOmzetgrens} komt.</li>
    <li><strong>Kies je pakket voor volgend jaar.</strong> Wil je overstappen, dan is 1 januari het makkelijkste moment. Lees wat je meeneemt in <a href="/overstappen/">overstappen van boekhoudprogramma</a>. Kom je van Moneybird, lees dan eerst <a href="/overstappen/moneybird/">wanneer je Moneybird opzegt</a>: pas na je btw-aangifte over het vierde kwartaal.</li>
  </ol>

  <h2>In januari</h2>
  <ol>
    <li><strong>Doe de btw-aangifte over het vierde kwartaal.</strong> Aangifte én betaling moeten uiterlijk ${DEADLINES.q4} binnen zijn. Bookiz rekent de aangifte uit per rubriek; jij neemt de cijfers over in Mijn Belastingdienst Zakelijk.</li>
    <li><strong>Zet je onbetaalde facturen op een rij.</strong> Welke facturen stonden op 31 december nog open? Die horen in je jaaroverzicht, en bij een overstap zijn het precies de facturen die je meeneemt.</li>
    <li><strong>Exporteer het oude jaar en bewaar het.</strong> Je moet je administratie ${f.bewaarplichtJaren} jaar kunnen tonen. In Bookiz exporteer je een heel jaar als één bestand; bewaar je bonnen erbij.</li>
  </ol>

  <h2>Vóór ${DEADLINES.ib}: je aangifte inkomstenbelasting</h2>
  <p>De aangifte inkomstenbelasting over het afgelopen jaar moet vaak vóór ${DEADLINES.ib} binnen zijn. Het jaaroverzicht van Bookiz berekent je winst, de ondernemersaftrek, de ${rule('mkb_winstvrijstelling', 'MKB-winstvrijstelling')} van ${f.mkbWinstvrijstelling} en wat je opzij moet zetten voor inkomstenbelasting en Zvw. Het is een berekening die je overneemt in je aangifte, geen aangifte die Bookiz voor je indient.</p>

  <h2>Vraag het je assistent</h2>
  <p>Zeg tegen je assistent: <strong>“Hoe sta ik ervoor?”</strong> Bookiz geeft de openstaande facturen, de uitgaven zonder bon en de eerstvolgende btw-deadline. Na de jaarwisseling vraag je: <strong>“Maak het jaaroverzicht van ${f.year}.”</strong></p>

  <h2>De bedragen van ${f.year}</h2>
  <p>Alle bedragen op deze pagina komen uit de <a href="${f.rulesPath}">belastingregels ${f.year}</a>, met bij elke regel de zin van de Belastingdienst waar het bedrag vandaan komt.</p>

  <h2>Bronnen</h2>
  ${sourceList([SOURCES.btwDeadlines, SOURCES.ibDeadline, SOURCES.korAanmelden, SOURCES.korAfmelden], esc)}
  <p class="note-line">Dit is geen belastingadvies. Twijfel je over je situatie, vraag het een boekhouder of de Belastingdienst.</p>
`;
}

export type MoneybirdFacts = { retentionYears: number; cloudPrice: number; cloudPriceIncl: number; q4Deadline: string; trialDays: number; korOmzetgrens: string };

const money = (amount: number): string => `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;

export const moneybirdFaq = (): [string, string][] => [
  ['Hoe lang is de opzegtermijn van Moneybird?', `Bij een maandabonnement stopt je pakket aan het eind van de maand die je al betaald hebt. Bij een jaarabonnement loopt het door tot het eind van het betaalde jaar. Geld voor een periode die al gefactureerd is, krijg je niet terug.`],
  ['Raak ik mijn Moneybird-gegevens kwijt als ik opzeg?', `Als je niets doet, wel. Moneybird verwijdert je administratie 14 dagen na de einddatum van je abonnement, tenzij je alsnog een pakket kiest, zoals Compact. Maak daarom eerst een jaarexport van elk boekjaar.`],
  ['Kan ik Moneybird opzeggen via de app of per e-mail?', `Nee. Opzeggen kan alleen in de webversie, op een computer of in de desktopversie op je telefoon, en alleen door de eigenaar van de administratie.`],
  ['Is Moneybird nog gratis?', `Nee. Sinds de nieuwe pakketten van 1 juli 2026 heeft elke administratie een abonnement nodig. Het kleinste pakket, Compact, kost ${money(COMPETITOR_PRICES.moneybird.compactYear)} per maand bij een jaarabonnement.`],
  ['Heeft Bookiz een bankkoppeling zoals Moneybird?', `Nee. Je meldt een betaling aan je assistent. Heb je een bankkoppeling, voorraad of personeel nodig, dan past Moneybird beter.`],
];

export function moneybirdBody(f: MoneybirdFacts, esc: Esc): string {
  const m = COMPETITOR_PRICES.moneybird;
  const archive = m.startMonth + 11 * m.compactMonth;
  const priceDate = new Date(`${PRICES_CHECKED_ON}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `
  <h2>Hoe zeg je Moneybird op?</h2>
  <p>Opzeggen doe je in de webversie van Moneybird, als eigenaar van de administratie. Op je telefoon gebruik je de desktopversie van de site.</p>
  <ol>
  <li><strong>Zeg eerst je Moneybird Betaalrekening op, als je die hebt.</strong> Die heeft een actief pakket nodig. Boek het saldo over, blokkeer je pas en zeg de rekening op via Instellingen › Bank › Rekeningen.</li>
  <li><strong>Maak een back-up van elk boekjaar.</strong> Ga naar Instellingen › Boekhouding › Boekhouding exporteren en klik bij Jaarexport op Download jaarexport. Kies het boekjaar, klik op Exporteren en download het ZIP-bestand. Je moet je administratie ${f.retentionYears} jaar kunnen tonen.</li>
  <li><strong>Zeg je abonnement op.</strong> Ga naar Instellingen › Abonnement › Huidig pakket en klik op Abonnement opzeggen. Je ziet twee datums en bevestigt met een vinkje dat je ze begrijpt.</li>
  </ol>
  <h2>Wat gebeurt er na het opzeggen?</h2>
  <p>Tot en met de einddatum werk je gewoon door. Na de einddatum kun je niet meer in je administratie werken, maar wel nog een back-up maken. 14 dagen na de einddatum verwijdert Moneybird je administratie met alle gegevens, tenzij je alsnog een pakket kiest. Zeg je niets op, dan verlengt je abonnement vanzelf.</p>
  <h2>Hoe lang is de opzegtermijn?</h2>
  <p>Bij een maandabonnement stopt je pakket aan het eind van de maand die je al betaald hebt. Bij een jaarabonnement loopt het door tot het eind van het betaalde jaar. Een wijziging met terugwerkende kracht kan niet, en Moneybird crediteert kosten die al gefactureerd zijn niet.</p>
  <h2>Wanneer zeg je op als je per 1 januari overstapt?</h2>
  <p>Pas na je laatste btw-aangifte uit Moneybird. Stap je per 1 januari over, dan doe je de aangifte over het vierde kwartaal nog in Moneybird, en die moet uiterlijk ${f.q4Deadline} binnen zijn. Zeg daarna op. Een maandabonnement kost je dan nog één maand Moneybird.</p>
  <p>Tijdlijn voor een overstap per 1 januari 2027:</p>
  <ul>
  <li><strong>December 2026:</strong> maak je laatste facturen van 2026 in Moneybird. Probeer Bookiz ernaast.</li>
  <li><strong>1 januari 2027:</strong> nieuwe facturen maak je in Bookiz. Zet je klanten en openstaande facturen over (zie hieronder).</li>
  <li><strong>Januari 2027:</strong> doe de btw-aangifte over het vierde kwartaal van 2026 uit Moneybird, uiterlijk ${f.q4Deadline}. Lees ook hoe je <a href="/jaarafsluiting/">je boekjaar afsluit</a>.</li>
  <li><strong>Na die aangifte:</strong> maak de jaarexport van 2026 en zeg op, of kies Compact.</li>
  </ul>
  <h2>Opzeggen of Compact houden?</h2>
  <p>Compact is het kleinste pakket van Moneybird en kost ${money(m.compactYear)} per maand bij een jaarabonnement of ${money(m.compactMonth)} per maand bij een maandabonnement. Je administratie blijft dan bewaard en je kunt erin kijken, maar je verstuurt maximaal 1 verkoopfactuur per maand en doet er geen btw-aangifte mee. Kies Compact als je je oude jaren in Moneybird wilt kunnen openen. Heb je genoeg aan de jaarexport op je eigen schijf, zeg dan op.</p>
  <h2>Wat kost blijven of overstappen?</h2>
  <p>Zelf hosten kost niets. Hieronder staan de reguliere jaarprijzen en de grenzen per pakket.</p>
  <p>Prijzen gecontroleerd op <time datetime="${PRICES_CHECKED_ON}">${priceDate}</time> op de prijspagina's van de aanbieders.</p>
  <table class="rules comparison">
    <caption>Prijzen per jaar, gecontroleerd op ${priceDate}</caption>
    <thead><tr><th scope="col">Pakket</th><th scope="col">Prijs per jaar</th><th scope="col">Grenzen</th><th scope="col">Past bij</th></tr></thead>
    <tbody>
      <tr><th scope="row">Bookiz, zelf hosten</th><td data-label="Prijs per jaar">€ 0</td><td data-label="Grenzen">Je installeert het zelf (Node.js). Geen bankkoppeling, voorraad of loon.</td><td data-label="Past bij">Wie zelf wil hosten en Claude Desktop of Claude Code gebruikt</td></tr>
      <tr><th scope="row">Bookiz Cloud</th><td data-label="Prijs per jaar">${money(f.cloudPrice)} excl. btw (${money(f.cloudPriceIncl)} incl.), eerste ${f.trialDays} dagen gratis</td><td data-label="Grenzen">Geen bankkoppeling. Alleen eenmanszaak en factuurstelsel.</td><td data-label="Past bij">Eenmanszaak met weinig facturen en een eigen AI-assistent</td></tr>
      <tr><th scope="row">Moneybird Compact</th><td data-label="Prijs per jaar">${money(m.compactYear * 12)} (jaarabonnement) of ${money(m.compactMonth * 12)} (maand)</td><td data-label="Grenzen">1 verkoopfactuur per maand, geen btw-aangifte, 5 banktransacties per maand</td><td data-label="Past bij">Je oude administratie bewaren</td></tr>
      <tr><th scope="row">Moneybird Start</th><td data-label="Prijs per jaar">${money(m.startYear * 12)} (jaarabonnement) of ${money(m.startMonth * 12)} (maand)</td><td data-label="Grenzen">200 verkoopfacturen en 20 banktransacties per maand, geen bankkoppeling</td><td data-label="Past bij">Zzp'er die in Moneybird btw-aangifte doet zonder bankkoppeling</td></tr>
      <tr><th scope="row">e-Boekhouden.nl ZZP</th><td data-label="Prijs per jaar">${money(COMPETITOR_PRICES.eboekhouden.zzpMonth * 12)} (12 x ${money(COMPETITOR_PRICES.eboekhouden.zzpMonth)}). Nieuwe klanten: 12 maanden 50% korting; starters 15 maanden gratis</td><td data-label="Grenzen">Maximaal 240 boekingen per boekjaar</td><td data-label="Past bij">Volledig online pakket voor weinig boekingen</td></tr>
      <tr><th scope="row">Jortt ZZP</th><td data-label="Prijs per jaar">${money(COMPETITOR_PRICES.jortt.zzpYear * 12)} excl. btw (jaar) of ${money(COMPETITOR_PRICES.jortt.zzpMonth * 12)} (maand)</td><td data-label="Grenzen">1 bank gekoppeld</td><td data-label="Past bij">Wie veel automatisch wil laten boeken, met bankkoppeling</td></tr>
      <tr><th scope="row">Excel of een spreadsheet</th><td data-label="Prijs per jaar">€ 0</td><td data-label="Grenzen">Je rekent btw en aftrekposten zelf uit, zonder controles</td><td data-label="Past bij">Wie alles zelf wil doen</td></tr>
    </tbody>
  </table>
  <p>Moneybird en e-Boekhouden.nl vermelden op deze prijspagina's niet of hun bedragen inclusief of exclusief btw zijn. De Jortt-prijzen zijn reguliere tarieven, zonder tijdelijke actie.</p>
  <p>Ben je btw-plichtig, dan trek je de btw op je abonnement af als voorbelasting.</p>
  <h2>Rekenvoorbeeld: een zzp'er met 3 facturen per maand</h2>
  <p>Aannames:</p>
  <ul>
  <li>Aanname: je hebt nu Moneybird Start op een maandabonnement (${money(m.startMonth)} per maand).</li>
  <li>Aanname: je doet btw-aangifte per kwartaal en hebt geen bankkoppeling nodig.</li>
  <li>Aanname: je stapt over per 1 januari 2027 en de prijzen van november 2026 blijven in 2027 gelijk.</li>
  <li>Aanname: alle bedragen zijn exclusief btw. Moneybird zegt op de prijspagina niet of de prijzen inclusief of exclusief btw zijn.</li>
  </ul>
  <table class="rules comparison"><thead><tr><th scope="col">Scenario voor 2027</th><th scope="col">Moneybird</th><th scope="col">Bookiz Cloud</th><th scope="col">Totaal 2027</th></tr></thead><tbody>
  <tr><th scope="row">Blijven op Start, maandabonnement</th><td data-label="Moneybird">12 x ${money(m.startMonth)} = ${money(m.startMonth * 12)}</td><td data-label="Bookiz Cloud">€ 0</td><td data-label="Totaal 2027">${money(m.startMonth * 12)}</td></tr>
  <tr><th scope="row">Overstappen, alles exporteren</th><td data-label="Moneybird">januari Start: ${money(m.startMonth)}</td><td data-label="Bookiz Cloud">${money(f.cloudPrice)}</td><td data-label="Totaal 2027">${money(m.startMonth + f.cloudPrice)}</td></tr>
  <tr><th scope="row">Overstappen, Moneybird als archief op Compact</th><td data-label="Moneybird">${money(m.startMonth)} + 11 x ${money(m.compactMonth)} = ${money(archive)}</td><td data-label="Bookiz Cloud">${money(f.cloudPrice)}</td><td data-label="Totaal 2027">${money(archive + f.cloudPrice)}</td></tr>
  <tr><th scope="row">Overstappen en Bookiz zelf hosten, alles exporteren</th><td data-label="Moneybird">${money(m.startMonth)}</td><td data-label="Bookiz Cloud">€ 0</td><td data-label="Totaal 2027">${money(m.startMonth)}</td></tr>
  </tbody></table>
  <p>Wie op Start blijft met een jaarabonnement, betaalt 12 x ${money(m.startYear)} = ${money(m.startYear * 12)}. Kreeg je sinds de nieuwe pakketten van 1 juli 2026 een overgangskorting, dan is jouw bedrag anders: kijk in Moneybird bij Instellingen › Abonnement › Huidig pakket › Verbruik.</p>
  <h2>Klanten en openstaande facturen overzetten</h2>
  <p>Je neemt alleen mee wat na de overstapdatum doorloopt: je klanten, je onbetaalde facturen, je bedrijfsmiddelen met hun boekwaarde en, bij een overstap midden in het jaar, je laatste factuurnummer.</p>
  <ul>
  <li><strong>Met je assistent.</strong> Moneybird heeft een eigen MCP-koppeling voor AI-assistenten; alleen-lezen is genoeg. Koppel je assistent aan Moneybird en aan Bookiz en zeg: "Ik stap per 1 januari over van Moneybird. Zet mijn klanten en openstaande facturen over naar Bookiz." Je bedrijfsmiddelen en hun boekwaarde geef je zelf op.</li>
  <li><strong>Zonder koppeling.</strong> Lees de gegevens voor uit je export. Bookiz vraagt om de bedragen en schat niets.</li>
  </ul>
  <p>Controleer daarna: het openstaande bedrag in Bookiz moet gelijk zijn aan dat in Moneybird. De overstapfunctie van Bookiz is nieuw en is gebouwd vanuit de regels, niet getest op een echte export van een ander pakket. Meld het als er iets niet klopt.</p>
  <p>Stap je midden in het jaar over, dan geef je je laatste factuurnummer op en telt Bookiz daarna door. Per 1 januari kun je met een nieuwe reeks beginnen.</p>
  <p>Gebruik je de kleineondernemersregeling, dan geef je in Bookiz de startdatum van je KOR op. Bookiz houdt je omzet bij tegen de grens van <a href="/belastingregels-2026/#kor_omzetgrens">${f.korOmzetgrens}</a>.</p>
  <h2>Wat Bookiz niet kan</h2>
  <p>Bookiz is klein met opzet. Er is geen bankkoppeling: je meldt een betaling aan je assistent. Geen voorraad, geen loonadministratie, geen offertes. Bookiz is niet voor bv's, het kasstelsel, de margeregeling of goederen over de grens. Bookiz rekent je btw-aangifte en je jaaroverzicht uit, maar dient niets in bij de Belastingdienst. Heb je een bankkoppeling of personeel nodig, blijf dan bij Moneybird of kies een ander volledig pakket.</p>
  <h2>Volgende stap</h2>
  <ul>
  <li>Lees eerst <a href="/overstappen/">wanneer je het makkelijkst overstapt</a> (gids).</li>
  <li>Bekijk <a href="/goedkoop-boekhoudprogramma-zzp/">wat Bookiz kost en wat je daarnaast nodig hebt</a>.</li>
  <li><a href="/app">Probeer Bookiz Cloud ${f.trialDays} dagen gratis</a> of <a href="https://github.com/meestierolff/bookiz">host het zelf, gratis</a>.</li>
  </ul>
  <h2>Bronnen</h2>
  ${sourceList([SOURCES.moneybirdBackup, SOURCES.moneybirdOpzeggen, SOURCES.moneybirdAgents, SOURCES.moneybirdPrijzen, SOURCES.moneybirdPakketten, SOURCES.moneybirdNieuwePakketten, SOURCES.moneybirdBetaalrekening, SOURCES.eboekhoudenPrijzen, SOURCES.jorttPrijs, SOURCES.btwDeadlines], esc)}
  <p>Moneybird is een merk van Moneybird B.V. Bookiz is er niet aan verbonden.</p>
`;
}

export type CostFacts = {
  cloudYear: string;
  cloudYearIncl: string;
  cloudMonth: string;
  trialDays: number;
  dfy: { year: string; yearIncl: string } | null;
  repoUrl: string;
};

export const costFaq = (f: CostFacts): [string, string][] => [
  [
    'Bestaat er een gratis boekhoudprogramma voor zzp’ers?',
    `Ja. Bookiz kun je gratis zelf hosten; het is open source onder AGPL-3.0. Je installeert het op je eigen computer en koppelt het aan Claude Desktop of Claude Code. Wil je dat niet zelf doen, dan kost Bookiz Cloud ${f.cloudYear} per jaar exclusief btw.`,
  ],
  [
    'Zijn er kosten per factuur?',
    'Nee. Je betaalt niet per factuur, per bon of per btw-aangifte. Zelf hosten is gratis; Cloud is een vast bedrag per jaar.',
  ],
  [
    'Is Bookiz het goedkoopste boekhoudprogramma?',
    'Dat hangt af van wat je nodig hebt. Voor een eenmanszaak met weinig facturen die geen bankkoppeling nodig heeft, kost Bookiz weinig. Heb je een bankkoppeling, voorraad of personeel, dan is Bookiz niet geschikt, hoe goedkoop ook.',
  ],
  [
    'Kan ik later weer weg?',
    'Ja. Je exporteert een heel jaar als één bestand, en bij zelf hosten staat alles al op je eigen computer.',
  ],
];

export function costBody(f: CostFacts, esc: Esc): string {
  return `
  <h2>Wat Bookiz per jaar kost</h2>
  <table class="rules">
    <thead><tr><th scope="col">Versie</th><th scope="col">Per jaar, excl. btw</th><th scope="col">Wat je krijgt</th></tr></thead>
    <tbody>
      <tr><th scope="row">Zelf hosten</th><td class="value">€ 0</td><td>Alle functies op je eigen computer of server. Open source.</td></tr>
      <tr><th scope="row">Bookiz Cloud</th><td class="value">${f.cloudYear}</td><td>Wij hosten en houden het bij. ${f.cloudYearIncl} inclusief btw, ofwel ${f.cloudMonth} per maand exclusief btw. De eerste ${f.trialDays} dagen zijn gratis.</td></tr>
${f.dfy ? `      <tr><th scope="row">Done For You</th><td class="value">${f.dfy.year}</td><td>Cloud plus een zelfstandige boekhouder die je aangiftes indient. ${f.dfy.yearIncl} inclusief btw. Founding-prijs; de dienst start zodra de samenwerking met een boekhouder rond is.</td></tr>\n` : ''}    </tbody>
  </table>
  <p>Je betaalt niet per factuur, per bon of per btw-aangifte.</p>

  <h2>Wat je daarnaast nodig hebt</h2>
  <ul>
    <li><strong>Een AI-assistent die MCP ondersteunt.</strong> Bij Claude kan dat op elk abonnement, ook het gratis: daarop mag je één eigen connector toevoegen, en dat is genoeg voor Bookiz. Bij ChatGPT kan een eigen MCP-server met schrijfrechten alleen op Business, Enterprise en Edu.</li>
    <li><strong>Voor zelf hosten:</strong> Node.js en Claude Desktop of Claude Code. De stappen staan in de <a href="${esc(f.repoUrl)}">README op GitHub</a>.</li>
  </ul>

  <h2>Waar let je op bij een goedkoop boekhoudprogramma?</h2>
  <p>De maandprijs zegt weinig. Vergelijk boekhoudsoftware op wat je in een heel jaar betaalt voor de manier waarop jij werkt:</p>
  <ul>
    <li><strong>Betaal je per factuur of per boeking?</strong> Dan stijgen de kosten met je werk. Bookiz rekent een vast bedrag, hoeveel facturen je ook stuurt.</li>
    <li><strong>Zit er een limiet op het aantal facturen of boekingen?</strong> Een goedkoop pakket met een limiet wordt duur zodra je eroverheen gaat.</li>
    <li><strong>Kost de bankkoppeling extra?</strong> Heb je haar niet nodig, betaal er dan ook niet voor. Bookiz heeft er geen.</li>
    <li><strong>Doet het de btw-aangifte en het jaaroverzicht?</strong> Een programma dat alleen factureert, laat het lastigste werk bij jou.</li>
    <li><strong>Kun je weg met al je gegevens?</strong> Je moet je administratie zeven jaar kunnen tonen, ook na je vertrek.</li>
  </ul>

  <h2>Zoek je een goedkope boekhouder?</h2>
  <p>Bookiz zelf is software, geen boekhouder. Wil je dat iemand je aangiftes voor je indient, dan is er Done For You: Bookiz Cloud met een zelfstandige boekhouder die meekijkt en je btw-aangiftes en aangifte inkomstenbelasting indient.${f.dfy ? ` Het kost ${f.dfy.year} per jaar exclusief btw (founding-prijs).` : ''} Done For You start zodra de samenwerking met een boekhouder rond is; tot die start krijg je op verzoek je hele betaling terug.</p>

  <h2>Wat erin zit</h2>
  <ul>
    <li>Facturen met alle verplichte gegevens, opeenvolgende nummers, pdf en e-mail.</li>
    <li>Bonnen en inkoopfacturen, ook als je privé betaalde.</li>
    <li>Btw-aangifte per rubriek in hele euro’s, met de documenten achter elk getal. Per kwartaal, per maand of, als de Belastingdienst dat heeft toegestaan, één keer per jaar.</li>
    <li>De kleineondernemersregeling: facturen zonder btw en je omzet tegen de grens.</li>
    <li>Een jaaroverzicht met winst, ondernemersaftrek, MKB-winstvrijstelling en wat je opzij zet voor inkomstenbelasting en Zvw.</li>
    <li>Periodieke facturen, overstappen vanuit een ander pakket, en export van een heel jaar als één bestand.</li>
  </ul>

  <h2>Wat er niet in zit</h2>
  <p>Geen bankkoppeling, geen voorraad en geen loonadministratie. Bookiz is niet voor bv’s, het kasstelsel, de margeregeling of goederen over de grens. Heb je dat nodig, kies dan een volledig boekhoudpakket.</p>

  <h2>Waarom het zo weinig kost</h2>
  <p>Bookiz heeft geen eigen chatbot en geen app: je gebruikt de AI-assistent die je al hebt. Er zit geen AI in Bookiz zelf; een vaste rekenmachine past de belastingregels toe, die met hun bron in een openbaar bestand staan. Daardoor is er weinig te hosten en te onderhouden.</p>

  <h2>Hoe begin je</h2>
  <ul>
    <li><a href="/app">Probeer Bookiz Cloud ${f.trialDays} dagen gratis</a>; je logt in met je e-mailadres.</li>
    <li><a href="${esc(f.repoUrl)}">Host het zelf</a>, gratis.</li>
    <li>Gebruik je nu Moneybird? Lees <a href="/overstappen/moneybird/">Moneybird opzeggen en overstappen</a>, met een rekenvoorbeeld.</li>
    <li>Kom je van een ander pakket? Lees <a href="/overstappen/">wanneer en hoe je overstapt</a>.</li>
  </ul>

  <h2>Bronnen</h2>
  ${sourceList([SOURCES.claudeConnectors, SOURCES.chatgptMcp], esc)}
`;
}
