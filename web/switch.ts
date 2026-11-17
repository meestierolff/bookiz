import { DEADLINES, SOURCES, sourceList } from './sources.ts';

/**
 * The hub page about switching bookkeeping software. Every factual claim here
 * is a rule from /rules (passed in), a deadline from ./sources.ts, or
 * something Bookiz does and has a test for. Keep it that way.
 */
export type SwitchFacts = { retentionYears: number; cloudPrice: number; repoUrl: string };

type Esc = (value: string) => string;

export const switchFaq = (facts: SwitchFacts): [string, string][] => [
  [
    'Wanneer kan ik het beste overstappen van boekhoudprogramma?',
    'Op 1 januari. Je boekjaar begint dan opnieuw: je factuurnummering kan opnieuw beginnen, er lopen geen btw-tijdvakken door elkaar en je jaaroverzicht komt uit één pakket. Het op één na beste moment is het begin van een btw-kwartaal, zoals 1 april: dan staat elke btw-aangifte in één pakket.',
  ],
  [
    'Kan ik in het voorjaar nog overstappen?',
    `Ja. Stap over per 1 april: je doet de aangifte over het eerste kwartaal nog uit je oude pakket (uiterlijk ${DEADLINES.q1}) en vanaf het tweede kwartaal werk je in Bookiz. Voor je aangifte inkomstenbelasting over dat jaar tel je januari tot en met maart uit je oude pakket op bij wat Bookiz berekent.`,
  ],
  [
    'Moet ik mijn oude administratie meenemen naar het nieuwe pakket?',
    `Nee. Je moet haar ${facts.retentionYears} jaar kunnen tonen, maar dat hoeft niet in je nieuwe pakket. Maak een volledige export van je oude pakket (facturen, bonnen, overzichten en aangiftes) en bewaar die. Je neemt alleen mee wat nog doorloopt: klanten, onbetaalde facturen en bedrijfsmiddelen die je nog afschrijft.`,
  ],
  [
    'Mag mijn factuurnummering opnieuw beginnen als ik overstap?',
    'Ja. De Belastingdienst eist opeenvolgende nummers, in één of meer reeksen, en elk nummer mag maar één keer voorkomen. Een nieuwe reeks per jaar is gebruikelijk. Stap je midden in het jaar over, dan telt Bookiz door vanaf je laatste nummer.',
  ],
  [
    'Wanneer zeg ik mijn oude pakket op?',
    `Pas als drie dingen klaar zijn: de laatste btw-aangifte uit je oude pakket, een volledige export die je ${facts.retentionYears} jaar bewaart, en de controle dat het openstaande bedrag in Bookiz gelijk is aan dat in je oude pakket. Stap je in het voorjaar over, wacht dan ook tot je aangifte inkomstenbelasting over het vorige jaar is gedaan.`,
  ],
  [
    'Kan ik overstappen vanuit Moneybird?',
    'Ja. Moneybird heeft een eigen MCP-koppeling voor AI-assistenten. Koppel je assistent aan Moneybird en aan Bookiz, en vraag hem je klanten en openstaande facturen over te zetten. Hoe je een back-up maakt en wat er na opzeggen gebeurt, staat in de gids over overstappen van Moneybird.',
  ],
  [
    'Wat kost overstappen naar Bookiz?',
    `Zelf hosten is gratis. Bookiz Cloud kost € ${facts.cloudPrice} per jaar exclusief btw, na dertig dagen op proef. Voor het overzetten zelf betaal je niets.`,
  ],
];

export function switchBody(facts: SwitchFacts, esc: Esc): string {
  return `
  <h2>Het korte antwoord</h2>
  <p>Stap over op 1 januari, of anders aan het begin van een btw-kwartaal: 1 april, 1 juli of 1 oktober. Neem alleen mee wat nog leeft: je klanten, je onbetaalde facturen en de bedrijfsmiddelen die je nog afschrijft. Je oude jaren zet je niet over. Die bewaar je als export, ${facts.retentionYears} jaar lang.</p>

  <h2>Drie momenten om over te stappen</h2>
  <table class="rules">
    <thead><tr><th scope="col">Moment</th><th scope="col">Wat het makkelijk maakt</th><th scope="col">Waar je op let</th></tr></thead>
    <tbody>
      <tr><th scope="row">1 januari</th><td>Een nieuwe nummerreeks, geen btw-kwartaal in twee pakketten, en je jaaroverzicht komt uit één pakket.</td><td>De aangifte over het vierde kwartaal doe je nog uit je oude pakket, uiterlijk ${DEADLINES.q4}.</td></tr>
      <tr><th scope="row">Begin van een kwartaal</th><td>Elke btw-aangifte staat in één pakket. In het voorjaar is 1 april het logische moment.</td><td>Je factuurnummers lopen door. Voor je aangifte inkomstenbelasting tel je de maanden vóór de overstap uit je oude pakket op.</td></tr>
      <tr><th scope="row">Elke andere dag</th><td>Kan. Bookiz telt door vanaf je laatste factuurnummer.</td><td>Het lopende kwartaal staat dan in twee pakketten. Voor die ene btw-aangifte tel je beide op.</td></tr>
    </tbody>
  </table>

  <h2>Waarom 1 januari het makkelijkst is</h2>
  <ul>
    <li><strong>Je factuurnummers kunnen opnieuw beginnen.</strong> Geen doorlopende reeks die in twee pakketten moet kloppen.</li>
    <li><strong>Geen half jaar overzetten.</strong> Omzet, kosten en btw van het oude jaar blijven waar ze zijn.</li>
    <li><strong>Je jaaroverzicht komt uit één pakket.</strong> Voor je aangifte inkomstenbelasting hoef je niets bij elkaar te tellen.</li>
  </ul>
  <p>Wat je in december en januari nog moet doen voor het oude jaar, staat in de <a href="/jaarafsluiting/">checklist voor de jaarafsluiting</a>.</p>

  <h2>Overstappen in het voorjaar</h2>
  <p>Heb je 1 januari gemist, dan is het voorjaar het tweede goede moment. Stap over per 1 april:</p>
  <ol>
    <li><strong>Het eerste kwartaal sluit je af in je oude pakket.</strong> Die btw-aangifte en de betaling moeten uiterlijk ${DEADLINES.q1} binnen zijn.</li>
    <li><strong>Vanaf 1 april boek je in Bookiz.</strong> Bookiz telt door vanaf je laatste factuurnummer en neemt je onbetaalde facturen en bedrijfsmiddelen over.</li>
    <li><strong>Doe je aangifte inkomstenbelasting over het vorige jaar uit je oude pakket.</strong> Die moet vaak vóór ${DEADLINES.ib} binnen zijn. Zeg je oude pakket pas op als die aangifte en je export klaar zijn.</li>
  </ol>
  <p>Eén ding blijft dat jaar handwerk: je jaaroverzicht in Bookiz begint op 1 april. Voor je aangifte inkomstenbelasting over het jaar van de overstap tel je januari tot en met maart uit je oude pakket erbij op.</p>

  <h2>Overstappen in vijf stappen</h2>
  <ol>
    <li><strong>Exporteer je oude administratie.</strong> Alle facturen en bonnen als bestand, plus je overzichten en btw-aangiftes. Bewaar dit ${facts.retentionYears} jaar; zonder export mag je je oude pakket niet opzeggen.</li>
    <li><strong>Doe je laatste btw-aangifte vanuit je oude pakket.</strong> Over het kwartaal vóór je overstap.</li>
    <li><strong>Schrijf op wat doorloopt.</strong> Welke facturen zijn nog niet betaald, welke bedrijfsmiddelen schrijf je nog af en tegen welke boekwaarde, wat is je laatste factuurnummer, en doe je mee aan de kleineondernemersregeling?</li>
    <li><strong>Koppel je assistent aan Bookiz en zeg dat je overstapt.</strong> Bijvoorbeeld: “Ik stap per 1 april over vanuit mijn oude boekhoudpakket. Neem mijn klanten, openstaande facturen en bedrijfsmiddelen over.” Bookiz vraagt om de bedragen en schat niets.</li>
    <li><strong>Controleer en zeg dan pas op.</strong> Het openstaande bedrag in Bookiz moet gelijk zijn aan dat in je oude pakket.</li>
  </ol>

  <h2>Wat Bookiz overneemt en wat niet</h2>
  <table class="rules">
    <thead><tr><th scope="col">Onderdeel</th><th scope="col">Gaat mee</th><th scope="col">Hoe</th></tr></thead>
    <tbody>
      <tr><th scope="row">Klanten</th><td class="value">Ja</td><td>Naam, adres, e-mail en btw-nummer.</td></tr>
      <tr><th scope="row">Onbetaalde facturen</th><td class="value">Ja</td><td>Met hun oorspronkelijke nummer. Ze tellen niet opnieuw mee voor omzet en btw; je registreert alleen nog de betaling.</td></tr>
      <tr><th scope="row">Bedrijfsmiddelen</th><td class="value">Ja</td><td>Tegen de boekwaarde op de overstapdatum, met de resterende jaren. De afschrijving loopt gewoon door.</td></tr>
      <tr><th scope="row">Factuurnummering</th><td class="value">Ja</td><td>Bij een overstap midden in het jaar telt Bookiz door vanaf je laatste nummer.</td></tr>
      <tr><th scope="row">Kleineondernemersregeling</th><td class="value">Ja</td><td>Je geeft de startdatum op; facturen gaan zonder btw de deur uit.</td></tr>
      <tr><th scope="row">Oude jaren</th><td class="value">Nee</td><td>Bewust niet. Die staan in je export. Zo sleep je geen fouten uit het oude pakket mee.</td></tr>
      <tr><th scope="row">Bankkoppeling</th><td class="value">Nee</td><td>Bookiz heeft er geen. Je meldt een betaling aan je assistent.</td></tr>
    </tbody>
  </table>

  <h2>Overstappen vanuit Moneybird</h2>
  <p>Moneybird heeft een eigen MCP-koppeling voor AI-assistenten. Koppel je assistent aan beide, dan kan hij je klanten en je onbetaalde facturen in Moneybird opzoeken en in Bookiz vastleggen. Let op: na de einddatum van je abonnement verwijdert Moneybird je administratie na veertien dagen. Maak dus eerst een back-up. Alle stappen staan in <a href="/overstappen/moneybird/">overstappen van Moneybird</a>.</p>
  <p>De overstapfunctie van Bookiz is nieuw. Vergelijk na afloop het openstaande bedrag en de boekwaarde van je bedrijfsmiddelen met de cijfers in je oude pakket, en meld het als er iets niet klopt.</p>

  <h2>Overstappen van Jortt, e-Boekhouden, Rompslomp of een spreadsheet</h2>
  <p>Het werkt hetzelfde als vanuit Moneybird. Zoek in de kennisbank van je pakket hoe je per boekjaar exporteert, en bewaar die export ${facts.retentionYears} jaar. Haal daarna uit je pakket wat doorloopt: je klanten, je onbetaalde facturen met hun nummer en bedrag, je bedrijfsmiddelen met hun boekwaarde en je laatste factuurnummer. Houd je je boekhouding in een spreadsheet bij, dan staat alles daar al: lees het voor aan je assistent of geef hem het bestand.</p>

  <h2>Bronnen</h2>
  ${sourceList([SOURCES.btwDeadlines, SOURCES.ibDeadline, SOURCES.moneybirdOpzeggen], esc)}
`;
}
