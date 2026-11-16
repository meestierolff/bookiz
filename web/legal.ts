/**
 * Privacy statement and terms for boekiehouder.nl. Based on the owner's earlier
 * approved texts, rewritten for what Bookiz actually does: who processes what,
 * and where. Change these together with the product, not after it.
 */
export type Company = {
  /** Trade name the customer sees. */
  name: string;
  /** The business behind it, as registered with the KvK. */
  legal_name: string;
  legal_form: string;
  email: string;
  kvk: string;
  vat_id: string;
  address: string;
};

/** "Bookiz, een handelsnaam van Top of the World (eenmanszaak)". */
export function who(company: Company): string {
  if (!company.legal_name || company.legal_name === company.name) return company.name;
  return `${company.name}, een handelsnaam van ${company.legal_name}${company.legal_form ? ` (${company.legal_form})` : ''}`;
}

type Section = { title: string; body: string[] };

const p = (text: string) => `<p>${text}</p>`;
const list = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

function identity(company: Company): string {
  const lines = [
    who(company),
    company.address,
    company.kvk && `KvK-nummer ${company.kvk}`,
    company.vat_id && `Btw-identificatienummer ${company.vat_id}`,
    `E-mail: <a href="mailto:${company.email}">${company.email}</a>`,
  ].filter(Boolean);
  return `<p>${lines.join('<br>')}</p>`;
}

function render(sections: Section[]): string {
  return sections.map((section) => `<h2>${section.title}</h2>\n${section.body.join('\n')}`).join('\n');
}

export function privacy(company: Company): string {
  const mail = `<a href="mailto:${company.email}">${company.email}</a>`;
  return render([
    {
      title: '1. Wie zijn wij?',
      body: [
        p('Met “wij” bedoelen we Bookiz, de aanbieder van deze website en van Bookiz Cloud. Met “jij” bedoelen we jou als bezoeker of klant.'),
        identity(company),
      ],
    },
    {
      title: '2. Twee rollen',
      body: [
        p('Voor de gegevens van jou als bezoeker of klant zijn wij de verwerkingsverantwoordelijke. Deze verklaring gaat over die gegevens.'),
        p('Voor de administratie die je in Bookiz Cloud bijhoudt, zoals gegevens van je eigen klanten en leveranciers, ben jij de verantwoordelijke en zijn wij de verwerker. Daarvoor geldt de verwerkersafspraak in onze voorwaarden.'),
        p('Host je Bookiz zelf, dan verwerken wij niets van je administratie. Alles staat dan op je eigen computer of server.'),
      ],
    },
    {
      title: '3. Welke gegevens leggen we vast?',
      body: [
        p('<strong>Als je de website bezoekt.</strong> De openbare pagina’s plaatsen geen cookies en bevatten geen scripts of meetpixels. Log je in op Bookiz Cloud, dan plaatsen we twee functionele cookies om je ingelogd te houden; verder niets. Onze hostingpartij verwerkt technische verbindingsgegevens, zoals je IP-adres, om de pagina te kunnen tonen en misbruik te weren.'),
        p('<strong>Als je contact opneemt.</strong> Je e-mailadres, je naam en wat je ons schrijft, om je te kunnen antwoorden.'),
        p('<strong>Als je betaalt.</strong> Je naam, e-mailadres, factuuradres en eventueel btw-nummer, via onze betaalprovider. Kaart- of bankgegevens zien wij niet.'),
        p('<strong>Als je Bookiz Cloud gebruikt.</strong> Je e-mailadres om in te loggen, je bedrijfsgegevens (naam, adres, KvK-nummer, btw-nummer, IBAN) en de administratie die je via je assistent invoert: facturen, uitgaven, relaties en aangiftes. Daarnaast een logboek van wijzigingen, zodat je kunt nagaan wat wanneer is geboekt.'),
        p('<strong>Bonnen en inkoopfacturen.</strong> Het originele bestand sturen we door naar je eigen mailbox en bewaren we zelf niet. Wij bewaren alleen een controlegetal waarmee je kunt aantonen dat het bestand niet is veranderd.'),
      ],
    },
    {
      title: '4. Wat doet je AI-assistent?',
      body: [
        p('Bookiz heeft geen eigen AI. Je bedient Bookiz met de assistent die je zelf kiest, bijvoorbeeld Claude of ChatGPT. Wat je in dat gesprek deelt, waaronder foto’s van bonnen, wordt verwerkt door de aanbieder van die assistent onder diens eigen voorwaarden. Wij ontvangen alleen wat je assistent naar Bookiz stuurt.'),
      ],
    },
    {
      title: '5. Waarom mogen we dit?',
      body: [
        list([
          'Om de overeenkomst met jou uit te voeren: de dienst leveren, factureren en ondersteunen.',
          'Omdat de wet het eist: onze eigen administratie bewaren we zeven jaar.',
          'Vanwege ons gerechtvaardigd belang: de dienst veilig en werkend houden.',
        ]),
        p('We versturen geen reclame zonder je toestemming, en we verkopen of verhuren je gegevens nooit.'),
      ],
    },
    {
      title: '6. Wie verwerken er gegevens voor ons?',
      body: [
        list([
          '<strong>Supabase</strong>: database en inloggen. De gegevens staan in de Europese Unie (Frankfurt).',
          '<strong>Vercel</strong>: hosting van de website en de server.',
          '<strong>Brevo</strong>: verzenden van e-mail, zoals facturen aan je klanten en bonnen naar je eigen mailbox.',
          '<strong>Stripe</strong>: betalingen voor je abonnement.',
        ]),
        p('Sommige van deze partijen zijn Amerikaanse bedrijven of hebben onderaannemers buiten de EU. Zij bieden daarvoor de wettelijk vereiste waarborgen. Verder delen we gegevens alleen als de wet ons daartoe verplicht.'),
      ],
    },
    {
      title: '7. Hoe lang bewaren we gegevens?',
      body: [
        list([
          'Je administratie in Bookiz Cloud: zolang je account actief is. Na opzegging kun je alles exporteren; daarna verwijderen we het uit onze actieve systemen.',
          'Onze eigen facturen aan jou: zeven jaar.',
          'Correspondentie: zolang nodig om je vraag af te handelen.',
          'Verwijderde gegevens kunnen nog korte tijd in back-ups staan, tot die worden overschreven.',
        ]),
        p('Let op: jij bent zelf verplicht je administratie zeven jaar te bewaren. Maak daarom een export voordat je opzegt, en bewaar de e-mails met je bonnen.'),
      ],
    },
    {
      title: '8. Beveiliging',
      body: [
        list([
          'Verbindingen zijn versleuteld met TLS.',
          'Elke klant heeft een eigen, afgescheiden deel van de database.',
          'De database is versleuteld opgeslagen bij onze leverancier.',
          'Toegang tot Bookiz loopt via een inlog of een geheim dat alleen jij hebt.',
        ]),
      ],
    },
    {
      title: '9. Jouw rechten',
      body: [
        p(`Je kunt ons vragen om inzage, correctie, verwijdering, beperking of overdracht van je gegevens, en je kunt bezwaar maken tegen het gebruik ervan. Mail naar ${mail}. We kunnen je vragen te laten zien dat jij het bent, en je krijgt binnen een maand antwoord.`),
        p('Ben je het niet met ons eens, laat het ons dan eerst weten. Je kunt ook altijd een klacht indienen bij de <a href="https://www.autoriteitpersoonsgegevens.nl">Autoriteit Persoonsgegevens</a>.'),
      ],
    },
    {
      title: '10. Wijzigingen',
      body: [p('Als Bookiz verandert, passen we deze verklaring aan. De nieuwste versie staat op deze pagina. Bij belangrijke wijzigingen laten we het klanten per e-mail weten.')],
    },
  ]);
}

export function terms(company: Company, cloudPriceExcl: number): string {
  const mail = `<a href="mailto:${company.email}">${company.email}</a>`;
  return render([
    {
      title: '1. Voor wie en wanneer',
      body: [
        p('Deze voorwaarden gelden voor het gebruik van deze website en van Bookiz Cloud, de gehoste versie van Bookiz. Met “wij” bedoelen we Bookiz; met “jij” de ondernemer die Bookiz gebruikt.'),
        identity(company),
        p('De open-sourceversie die je zelf host valt niet onder deze voorwaarden, maar onder de licentie in de repository (AGPL-3.0). Daarop geven wij geen ondersteuning en geen garantie.'),
        p('Bookiz Cloud is bedoeld voor ondernemers. Je moet achttien jaar of ouder zijn en bevoegd om namens je onderneming te handelen. Eén account is voor één onderneming.'),
      ],
    },
    {
      title: '2. Wat Bookiz doet en niet doet',
      body: [
        p('Bookiz legt vast wat jij of je AI-assistent aanlevert en rekent daarmee volgens de belastingregels die in de repository staan, met hun bron. Wij doen ons best die regels juist en actueel te houden, maar kunnen niet garanderen dat elke berekening foutloos is.'),
        list([
          'Bookiz is geen belastingadviseur en geen boekhouder. De uitkomsten zijn geen advies.',
          'Bookiz dient geen aangiftes in bij de Belastingdienst. Dat doe je zelf.',
          'Je AI-assistent is niet van ons. Leest die een bon verkeerd, dan staat er iets verkeerds in je administratie. Controleer wat er geboekt wordt.',
          'Jij blijft verantwoordelijk voor je administratie, je aangiftes en het bewaren van je stukken gedurende de wettelijke termijn.',
        ]),
        p('We mogen Bookiz aanpassen, uitbreiden of onderdelen ervan beëindigen. Onderhoud doen we zo veel mogelijk buiten kantooruren. We garanderen geen ononderbroken beschikbaarheid.'),
      ],
    },
    {
      title: '3. Jouw verantwoordelijkheden',
      body: [
        list([
          'Houd je inloggegevens en de koppeling met je assistent geheim. Wat met jouw account gebeurt, komt voor jouw rekening.',
          'Zorg dat je bedrijfsgegevens kloppen; ze komen op je facturen.',
          'Gebruik Bookiz niet voor fraude, spam of andere onrechtmatige doelen, en probeer de dienst niet te verstoren of binnen te dringen.',
          'Verstuur via Bookiz alleen facturen aan je eigen klanten.',
        ]),
      ],
    },
    {
      title: '4. Prijs en betaling',
      body: [
        p(`Bookiz Cloud kost € ${cloudPriceExcl} per jaar, exclusief btw. Je betaalt vooraf via onze betaalprovider Stripe. Het abonnement wordt elk jaar automatisch verlengd, tenzij je opzegt.`),
        p('Binnen dertig dagen na je eerste betaling krijg je je geld terug als Bookiz je niet bevalt. Daarna betalen we geen deel van een lopend jaar terug.'),
        p('Wijzigen we de prijs, dan hoor je dat minstens dertig dagen van tevoren. De nieuwe prijs geldt vanaf je volgende verlenging; je kunt dan opzeggen.'),
        p('Kunnen we een betaling niet innen, dan mogen we de toegang opschorten tot er is betaald. Je administratie blijft in die periode bewaard.'),
      ],
    },
    {
      title: '5. Opzeggen en je gegevens',
      body: [
        p(`Je kunt op elk moment opzeggen met een e-mail naar ${mail} vanaf het adres van je account. Je houdt toegang tot het einde van de betaalde periode.`),
        p('Je kunt altijd je hele administratie exporteren, ook na opzegging tot het einde van je periode. Doe dat voordat je vertrekt: jij moet je administratie zeven jaar kunnen tonen. Na het einde van de overeenkomst verwijderen we je gegevens op jouw verzoek, en anders uiterlijk een jaar later, uit onze actieve systemen; in back-ups kunnen ze nog korte tijd voorkomen.'),
        p('Wij kunnen de overeenkomst opzeggen met een termijn van twee maanden, of direct bij misbruik of bij een ernstige schending van deze voorwaarden.'),
      ],
    },
    {
      title: '6. Van wie zijn de gegevens?',
      body: [
        p('Wat je in Bookiz invoert is en blijft van jou. De software is open source onder de licentie in de repository; de naam en het logo van Bookiz zijn van ons.'),
      ],
    },
    {
      title: '7. Verwerking van persoonsgegevens',
      body: [
        p('In je administratie staan persoonsgegevens van anderen, zoals je klanten. Daarvoor ben jij de verwerkingsverantwoordelijke en zijn wij de verwerker. Wij verwerken die gegevens alleen om Bookiz aan jou te leveren en volgens jouw opdracht, houden ze geheim, beveiligen ze passend, schakelen alleen de leveranciers in die in onze <a href="/privacy/">privacyverklaring</a> staan, helpen je bij verzoeken van betrokkenen, melden een datalek zonder onnodige vertraging aan jou, en verwijderen de gegevens na het einde van de overeenkomst.'),
      ],
    },
    {
      title: '8. Aansprakelijkheid',
      body: [
        p('Wil je ons aansprakelijk stellen, laat het ons dan eerst schriftelijk weten en geef ons een redelijke termijn om het op te lossen.'),
        p('Behalve bij opzet of grove schuld zijn wij niet aansprakelijk voor:'),
        list([
          'indirecte schade, zoals gevolgschade, gemiste winst of gemiste besparingen;',
          'schade door fouten die je had kunnen voorkomen door uitkomsten te controleren of een boekhouder of fiscalist te raadplegen;',
          'boetes, rente of naheffingen van de Belastingdienst;',
          'schade doordat je geen eigen kopie van je administratie of je bonnen hebt bewaard;',
          'fouten van je AI-assistent of van andere diensten die niet van ons zijn.',
        ]),
        p('Onze aansprakelijkheid is in alle gevallen beperkt tot het bedrag dat je ons hebt betaald voor het jaar waarin de schade is ontstaan.'),
        p('Bij overmacht, waaronder storingen bij onze leveranciers, hoeven wij onze verplichtingen niet na te komen zolang de overmacht duurt. Duurt die langer dan zestig dagen, dan mag je opzeggen.'),
      ],
    },
    {
      title: '9. Wijzigingen, vragen en geschillen',
      body: [
        p('We kunnen deze voorwaarden wijzigen en laten dat klanten van tevoren per e-mail weten. Ben je het er niet mee eens, dan kun je opzeggen.'),
        p(`Heb je een vraag of een klacht? Mail naar ${mail}. We proberen er eerst samen uit te komen.`),
        p('Op deze voorwaarden is Nederlands recht van toepassing. Geschillen leggen we voor aan de bevoegde Nederlandse rechter.'),
      ],
    },
  ]);
}
