/**
 * The page about switching bookkeeping software on 1 January. Every factual
 * claim here is either a rule from /rules (passed in) or something Bookiz does
 * and has a test for. Keep it that way.
 */
export type SwitchFacts = { retentionYears: number; cloudPrice: number; q4Deadline: string; repoUrl: string };

export const switchFaq = (facts: SwitchFacts): [string, string][] => [
  [
    'Wanneer kan ik het beste overstappen van boekhoudprogramma?',
    'Op 1 januari. Je boekjaar begint dan opnieuw: je factuurnummering start bij één, er lopen geen btw-tijdvakken door elkaar en je hoeft geen half jaar aan boekingen over te zetten. Midden in het jaar kan ook, maar dan neem je het laatste factuurnummer mee en doe je de al ingediende kwartalen niet opnieuw.',
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
    'Waar doe ik de btw-aangifte over het vierde kwartaal?',
    `Op basis van je oude pakket, want daar staan de facturen en bonnen van dat kwartaal. Die aangifte en de betaling moeten uiterlijk ${facts.q4Deadline} binnen zijn. Zeg je oude abonnement dus niet op voordat je die cijfers en je export hebt.`,
  ],
  [
    'Kan ik overstappen vanuit Moneybird?',
    'Ja. Moneybird heeft een eigen koppeling voor AI-assistenten. Koppel je assistent aan Moneybird en aan Bookiz, en vraag hem je klanten en je openstaande facturen over te zetten; je bedrijfsmiddelen geef je zelf op. Zonder die koppeling lees je de gegevens voor uit je export. Controleer daarna of het openstaande bedrag in Bookiz gelijk is aan dat in Moneybird.',
  ],
  [
    'Wat kost overstappen naar Bookiz?',
    `Zelf hosten is gratis. Bookiz Cloud kost € ${facts.cloudPrice} per jaar exclusief btw, na dertig dagen op proef. Voor het overzetten zelf betaal je niets.`,
  ],
];

export function switchBody(facts: SwitchFacts): string {
  return `
  <h2>Het korte antwoord</h2>
  <p>Stap over op 1 januari en neem alleen mee wat nog leeft: je klanten, je onbetaalde facturen en de bedrijfsmiddelen die je nog afschrijft. Je oude jaren zet je niet over. Die bewaar je als export, ${facts.retentionYears} jaar lang.</p>

  <h2>Waarom 1 januari</h2>
  <ul>
    <li><strong>Je factuurnummers beginnen opnieuw.</strong> Geen doorlopende reeks die in twee pakketten moet kloppen.</li>
    <li><strong>Geen half jaar overzetten.</strong> Omzet, kosten en btw van het oude jaar blijven waar ze zijn.</li>
    <li><strong>Je jaaroverzicht komt uit één pakket.</strong> Voor je aangifte inkomstenbelasting hoef je niets bij elkaar te tellen.</li>
  </ul>

  <h2>Overstappen in vijf stappen</h2>
  <ol>
    <li><strong>Exporteer je oude administratie.</strong> Alle facturen en bonnen als bestand, plus je overzichten en btw-aangiftes. Bewaar dit ${facts.retentionYears} jaar; zonder export mag je je oude pakket niet opzeggen.</li>
    <li><strong>Doe je laatste btw-aangifte vanuit je oude pakket.</strong> Het vierde kwartaal dien je in en betaal je uiterlijk ${facts.q4Deadline}.</li>
    <li><strong>Schrijf op wat doorloopt.</strong> Welke facturen zijn nog niet betaald, welke bedrijfsmiddelen schrijf je nog af en tegen welke boekwaarde, en doe je mee aan de kleineondernemersregeling?</li>
    <li><strong>Koppel je assistent aan Bookiz en zeg dat je overstapt.</strong> Bijvoorbeeld: “Ik stap per 1 januari over vanuit mijn oude boekhoudpakket. Neem mijn klanten, openstaande facturen en bedrijfsmiddelen over.” Bookiz vraagt om de bedragen en schat niets.</li>
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
  <p>Moneybird heeft een eigen koppeling voor AI-assistenten. Koppel je assistent aan beide, dan kan hij je klanten en je onbetaalde facturen in Moneybird opzoeken en in Bookiz vastleggen. Je bedrijfsmiddelen en hun boekwaarde geef je zelf op; die staan in je laatste jaaroverzicht.</p>
  <p>De overstapfunctie van Bookiz is nieuw. Vergelijk daarom na afloop het openstaande bedrag en de boekwaarde van je bedrijfsmiddelen met de cijfers in Moneybird, en meld het als er iets niet klopt.</p>

  <h2>Midden in het jaar overstappen</h2>
  <p>Dat kan. Bookiz telt door vanaf je laatste factuurnummer en rekent de btw vanaf het eerste tijdvak dat je nog niet hebt ingediend. De kwartalen die je al hebt aangegeven blijven in je oude pakket. Je jaaroverzicht in Bookiz dekt dan alleen het deel van het jaar na de overstap; voor je aangifte tel je beide delen op.</p>
`;
}
