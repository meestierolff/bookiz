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
  <p>Zelf hosten is gratis. Bookiz Cloud kost € ${f.cloudPrice} per jaar exclusief btw, na ${f.trialDays} dagen op proef. Het overzetten zelf kost niets.</p>

  <h2>Bronnen</h2>
  ${sourceList([SOURCES.moneybirdBackup, SOURCES.moneybirdOpzeggen, SOURCES.moneybirdAgents], esc)}
  <p class="note-line">Moneybird is een merk van Moneybird B.V. Bookiz is er niet aan verbonden. De stappen in Moneybird zijn overgenomen uit hun eigen kennisbank.</p>
`;
}
