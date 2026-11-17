import { DEADLINES, SOURCES, sourceList } from './sources.ts';

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
    <li><strong>Kies je pakket voor volgend jaar.</strong> Wil je overstappen, dan is 1 januari het makkelijkste moment. Lees wat je meeneemt in <a href="/overstappen/">overstappen van boekhoudprogramma</a>.</li>
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

export type MoneybirdFacts = { retentionYears: number; cloudPrice: number; trialDays: number; korOmzetgrens: string };

export const moneybirdFaq = (f: MoneybirdFacts): [string, string][] => [
  [
    'Raak ik mijn Moneybird-gegevens kwijt als ik opzeg?',
    'Als je niets doet, wel. Moneybird verwijdert je administratie veertien dagen na de einddatum van je abonnement, tenzij je een ander pakket kiest, zoals Compact. Maak daarom eerst een jaarexport van elk boekjaar en bewaar die.',
  ],
  [
    'Kan ik mijn factuurnummers uit Moneybird doortellen?',
    'Ja. Stap je midden in het jaar over, dan geef je je laatste factuurnummer op en telt Bookiz daarna door. Stap je per 1 januari over, dan kun je met een nieuwe reeks beginnen.',
  ],
  [
    'Gebruik ik de kleineondernemersregeling. Kan dat in Bookiz?',
    `Ja. Je geeft de startdatum van je KOR op; facturen gaan dan zonder btw de deur uit en Bookiz houdt je omzet bij tegen de grens van ${f.korOmzetgrens}. De factuur die de grens zou overschrijden, weigert Bookiz.`,
  ],
  [
    'Heeft Bookiz een bankkoppeling zoals Moneybird?',
    'Nee. Je meldt een betaling aan je assistent. Heb je een bankkoppeling, voorraad of personeel nodig, dan past Moneybird beter.',
  ],
];

export function moneybirdBody(f: MoneybirdFacts, esc: Esc): string {
  return `
  <h2>Is Bookiz iets voor jou?</h2>
  <p>Bookiz is bedoeld voor eenmanszaken met een handvol facturen per maand, die hun boekhouding willen doen in een gesprek met hun eigen AI-assistent. Het heeft geen bankkoppeling, geen voorraad en geen loonadministratie. Heb je die nodig, blijf dan bij Moneybird.</p>

  <h2>Stap 1: maak een back-up van elk boekjaar</h2>
  <p>Ga in Moneybird naar <strong>Instellingen › Boekhouding › Boekhouding exporteren</strong>. Klik bij Jaarexport op <strong>Download jaarexport</strong>, kies het boekjaar en klik op <strong>Exporteren</strong>. Zodra de export klaar is, download je het ZIP-bestand. Doe dit voor elk boekjaar dat je moet bewaren: je administratie moet je ${f.retentionYears} jaar kunnen tonen. In hetzelfde menu download je met Auditfile alleen de auditfile.</p>

  <h2>Stap 2: kies je overstapdatum</h2>
  <p>Per 1 januari is het makkelijkst: je jaaroverzicht komt dan uit één pakket. Het tweede goede moment is het begin van een btw-kwartaal, zoals 1 april. De aangifte over het kwartaal vóór je overstap doe je nog uit Moneybird. De afwegingen staan in <a href="/overstappen/">overstappen van boekhoudprogramma</a>.</p>

  <h2>Stap 3: zet over wat doorloopt</h2>
  <p>Je neemt alleen mee wat na de overstapdatum nog leeft: je klanten, je onbetaalde facturen, je bedrijfsmiddelen met hun boekwaarde, en bij een overstap midden in het jaar je laatste factuurnummer.</p>
  <ul>
    <li><strong>Met je assistent.</strong> Moneybird heeft een eigen MCP-koppeling voor AI-assistenten; alleen-lezen is genoeg. Koppel je assistent aan Moneybird en aan Bookiz en zeg: “Ik stap per 1 januari over van Moneybird. Zet mijn klanten en openstaande facturen over naar Bookiz.” Je bedrijfsmiddelen en hun boekwaarde geef je zelf op; die staan in je laatste jaaroverzicht.</li>
    <li><strong>Zonder koppeling.</strong> Lees de gegevens voor uit je export. Bookiz vraagt om de bedragen en schat niets.</li>
  </ul>

  <h2>Stap 4: controleer</h2>
  <p>Het openstaande bedrag in Bookiz moet gelijk zijn aan dat in Moneybird. Klopt de boekwaarde van je bedrijfsmiddelen ook, dan ben je klaar. Meld het als er iets niet klopt: de overstapfunctie van Bookiz is nieuw.</p>

  <h2>Stap 5: zeg Moneybird op</h2>
  <p>Opzeggen doe je in Moneybird via <strong>Instellingen › Abonnement › Huidig pakket</strong> met de knop <strong>Abonnement opzeggen</strong>. Je ziet dan twee datums. Tot de einddatum werk je gewoon door. Veertien dagen later verwijdert Moneybird je administratie met alle gegevens, tenzij je alsnog een pakket kiest, zoals Compact. Een back-up maken kan na de einddatum nog, tot de verwijderdatum. Wacht met opzeggen tot je laatste btw-aangifte uit Moneybird is gedaan.</p>

  <h2>Wat kost het?</h2>
  <p>Zelf hosten is gratis. Bookiz Cloud kost € ${f.cloudPrice} per jaar exclusief btw, na ${f.trialDays} dagen op proef. Het overzetten zelf kost niets. Wat je verder nodig hebt, staat in <a href="/goedkoop-boekhoudprogramma-zzp/">wat Bookiz kost</a>.</p>

  <h2>Bronnen</h2>
  ${sourceList([SOURCES.moneybirdBackup, SOURCES.moneybirdOpzeggen, SOURCES.moneybirdAgents], esc)}
  <p class="note-line">Moneybird is een merk van Moneybird B.V. Bookiz is er niet aan verbonden. De stappen in Moneybird zijn overgenomen uit hun eigen kennisbank.</p>
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

  <h2>Wat erin zit</h2>
  <ul>
    <li>Facturen met alle verplichte gegevens, opeenvolgende nummers, pdf en e-mail.</li>
    <li>Bonnen en inkoopfacturen, ook als je privé betaalde.</li>
    <li>Btw-aangifte per rubriek in hele euro’s, met de documenten achter elk getal.</li>
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
    <li>Kom je van een ander pakket? Lees <a href="/overstappen/">wanneer en hoe je overstapt</a>.</li>
  </ul>

  <h2>Bronnen</h2>
  ${sourceList([SOURCES.claudeConnectors, SOURCES.chatgptMcp], esc)}
`;
}
