/**
 * Content of the landing page that both the static HTML and /site.js use:
 * the build renders the first state, the script animates from there.
 * Everything here is example data and is labelled as such on the page.
 */
export type Logo = { name: string; logo: string };

const logo = (name: string, file: string): Logo => ({ name, logo: `/logos/${file}.png` });

/** The rotating word in the hero. The first one is what shows without JavaScript. */
export const ASSISTANTS: Logo[] = [
  { name: 'AI agents', logo: '/logo.png' },
  logo('Claude', 'claude'),
  logo('ChatGPT', 'chatgpt'),
  logo('OpenClaw', 'openclaw'),
  logo('Hermes', 'hermes'),
  logo('Claude Code', 'claudecode'),
  logo('Grok Bot', 'grok'),
];

/** Assistants that can add a remote or local MCP server. Not an endorsement, and not each one tested. */
export const ASSISTANT_GRID: Logo[] = [
  logo('Claude', 'claude'),
  logo('ChatGPT', 'chatgpt'),
  logo('Codex', 'openai'),
  logo('Cursor', 'cursor'),
  logo('Grok', 'grok'),
  logo('Gemini', 'gemini'),
  logo('Le Chat', 'mistral'),
  logo('GitHub Copilot', 'github'),
  logo('VS Code', 'vscode'),
  logo('Windsurf', 'windsurf'),
  logo('Perplexity', 'perplexity'),
];

export type Step =
  | { t: 'user'; text: string; attach?: string }
  | { t: 'tool'; text: string; detail: string }
  | { t: 'bot'; text: string };

export type LedgerRow = { icon: string; label: string; code: string; amount: string; tone: 'neutral' | 'plus' | 'btw' };

export type Scenario = { label: string; steps: Step[]; ledger: LedgerRow };

export const SCENARIOS: Scenario[] = [
  {
    label: 'Bonnetje',
    steps: [
      { t: 'user', attach: 'bon-lunch.jpg', text: 'Lunch met de klant, zelf voorgeschoten.' },
      { t: 'tool', text: 'record_expense', detail: '€ 54,50 · privé betaald' },
      { t: 'tool', text: 'attach_receipt', detail: 'origineel → je mailbox' },
      {
        t: 'bot',
        text: 'Geboekt als K2026-003: € 54,50, privé betaald. De btw op eten en drinken in de horeca is niet aftrekbaar; 80% telt als kosten.',
      },
    ],
    ledger: { icon: 'K', label: 'Lunch met klant', code: 'K2026-003 · privé betaald', amount: '− € 54,50', tone: 'neutral' },
  },
  {
    label: 'Factuur',
    steps: [
      { t: 'user', text: 'Maak een factuur voor Klant BV: tien uur advies à 85 euro.' },
      { t: 'tool', text: 'create_invoice', detail: 'concept' },
      { t: 'bot', text: 'Concept: € 850,00 + € 178,50 btw = € 1.028,50. Akkoord?' },
      { t: 'user', text: 'Ja, stuur maar op.' },
      { t: 'tool', text: 'finalize_invoice', detail: '2026-014 · pdf' },
      { t: 'tool', text: 'send_invoice', detail: '→ Klant BV' },
      { t: 'bot', text: 'Factuur 2026-014 is definitief en verstuurd. Een kopie staat in je mail.' },
    ],
    ledger: { icon: 'F', label: 'Klant BV · advies', code: '2026-014 · verstuurd', amount: '+ € 1.028,50', tone: 'plus' },
  },
  {
    label: 'Btw-aangifte',
    steps: [
      { t: 'user', text: 'Hoe sta ik ervoor?' },
      { t: 'tool', text: 'get_overview', detail: '2026' },
      { t: 'tool', text: 'vat_return', detail: 'Q4 · per rubriek' },
      {
        t: 'bot',
        text: 'Btw vierde kwartaal: € 1.473 te betalen, vóór 31 januari. Eén factuur staat open: Klant BV, € 1.028,50. De cijfers per rubriek staan klaar om over te nemen.',
      },
    ],
    ledger: { icon: 'B', label: 'Btw Q4 klaargezet', code: 'rubriek 1a t/m 5g', amount: '€ 1.473', tone: 'btw' },
  },
];

export const LEDGER_START: LedgerRow = {
  icon: 'F',
  label: 'Studio X · retainer',
  code: '2026-013 · betaald',
  amount: '+ € 1.210,00',
  tone: 'plus',
};

export type Agent = { glyph: string; name: string; role: string; tools: string[]; logs: string[] };

/** The 24 tools grouped by job. Shown as "agents" on the page; there is no AI inside Bookiz. */
export const AGENTS: Agent[] = [
  {
    glyph: 'FA',
    name: 'Factuur-agent',
    role: 'Maakt, nummert en verstuurt facturen',
    tools: ['create_invoice', 'finalize_invoice', 'send_invoice', '+2'],
    logs: ['create_invoice · Klant BV · € 1.028,50', 'finalize_invoice · 2026-014 · pdf', 'send_invoice · → Klant BV', 'register_payment · 2026-011 betaald', 'credit_invoice · 2026-009 gecrediteerd'],
  },
  {
    glyph: 'BO',
    name: 'Bonnetjes-agent',
    role: 'Boekt bonnen, ook als je privé betaalde',
    tools: ['record_expense', 'attach_receipt', '+2'],
    logs: ['record_expense · Coolblue · € 249,00', 'attach_receipt · origineel → mailbox', 'record_expense · Adobe · rubriek 4a', 'record_expense · lunch · 80% kosten', 'void_expense · dubbele bon geschrapt'],
  },
  {
    glyph: 'BW',
    name: 'Btw-agent',
    role: 'Rekent je aangifte uit per rubriek',
    tools: ['vat_return', 'mark_vat_return_filed'],
    logs: ['vat_return · Q4 · 1a € 1.785', 'vat_return · 5b voorbelasting € 337', 'vat_return · te betalen € 1.473', 'deadline · 31 januari', 'mark_vat_return_filed · Q3 bevroren'],
  },
  {
    glyph: 'RG',
    name: 'Regels-agent',
    role: 'Checkt elk getal tegen de Belastingdienst',
    tools: ['get_tax_rules'],
    logs: ['btw hoog tarief · 21% · bron ✓', 'KOR-grens · € 20.000 · bron ✓', 'zelfstandigenaftrek · € 1.200 · bron ✓', 'KIA-tabel 2026 · bron ✓', '2027 · wacht op publicatie'],
  },
  {
    glyph: 'OV',
    name: 'Overzicht-agent',
    role: 'Houdt deadlines en open posten bij',
    tools: ['get_overview', 'list_invoices', '+1'],
    logs: ['1 factuur staat open · 9 dagen', '2 bonnen missen een origineel', 'btw Q4 · nog 76 dagen', 'winst dit jaar bijgewerkt', 'volgende actie · bon uploaden'],
  },
  {
    glyph: 'JR',
    name: 'Jaar-agent',
    role: 'Van omzet naar belastbare winst',
    tools: ['year_report', 'set_year_facts'],
    logs: ['urencriterium · gehaald ✓', 'zelfstandigenaftrek toegepast', 'MKB-winstvrijstelling toegepast', 'KIA · laptop geactiveerd', 'opzijzetten IB + Zvw · € 6.980'],
  },
  {
    glyph: 'TF',
    name: 'Terugkerend-agent',
    role: 'Zet vaste facturen klaar als concept',
    tools: ['save_recurring_invoice', '+1'],
    logs: ['concept · retainer Studio X · maand', 'concept · hosting · kwartaal', 'wacht op jouw akkoord', 'concept · onderhoud · jaar', '2 concepten klaar voor december'],
  },
  {
    glyph: 'OS',
    name: 'Overstap-agent',
    role: 'Neemt je oude pakket over, of laat je gaan',
    tools: ['import_opening_state', 'export_books'],
    logs: ['import · 38 klanten uit Moneybird', 'import · nummering vanaf 2026-015', 'import · 3 open facturen', 'export_books · bookiz-2026.json', 'export · klaar voor je boekhouder'],
  },
];

/** Starting counters of the simulation. Not usage figures. */
export const AGENT_SEED = [41, 63, 12, 88, 27, 9, 14, 6];

export const FAQS: [string, string][] = [
  [
    'Verzint een AI dan mijn boekhouding?',
    'Nee. Je assistent leest het bonnetje en geeft de feiten door. Een vaste rekenmachine past de belastingregels toe. Zelfde invoer, zelfde boeken. Er zit geen AI in Bookiz zelf.',
  ],
  [
    'Welke assistent heb ik nodig?',
    'Een assistent die MCP ondersteunt: Claude, ChatGPT, Codex, Claude Code, Cursor en meer. Bij ChatGPT kan een eigen MCP-server met schrijfrechten nu alleen op Business, Enterprise en Edu. Lokaal werkt het met Claude Desktop, Claude Code en Codex. Voor de rest is er de Cloud-versie of je eigen server.',
  ],
  [
    'Doet Bookiz mijn aangifte bij de Belastingdienst?',
    'Bookiz rekent je btw-aangifte uit per rubriek, in hele euro’s, met de documenten achter elk getal. Jij neemt de cijfers over in Mijn Belastingdienst Zakelijk. Wil je dat iemand het voor je indient? Dan is er Done For You.',
  ],
  [
    'Kan ik de cijfers vertrouwen?',
    'Elke regel staat in een openbaar bestand, met de pagina van de Belastingdienst en de zin waar hij vandaan komt. Je boekhouder kan meelezen. Bookiz rekent niet voor een jaar zonder regelbestand en gokt nooit.',
  ],
  [
    'Waar staan mijn gegevens?',
    'Bij Self-host op je eigen computer, in ~/.bookiz. Bij Cloud in een eigen, afgeschermd databaseschema. Je kunt altijd een heel jaar exporteren als één bestand.',
  ],
  [
    'Kan ik overstappen van Moneybird of een spreadsheet?',
    'Ja. Je neemt je klanten, openstaande facturen, activa en factuurnummering mee. Overstappen per 1 januari is het makkelijkst.',
  ],
  [
    'Voor wie is Bookiz niet?',
    'Voor bv’s, het kasstelsel, de margeregeling en goederen over de grens. En er is geen bankkoppeling: Bookiz is met opzet klein.',
  ],
];
