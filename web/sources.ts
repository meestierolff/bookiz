/**
 * Facts on the guide pages that do not come from /rules: deadlines published
 * by the Belastingdienst and how Moneybird handles exports and cancelling.
 * Each one was read at its source on CHECKED_ON. When a page here changes,
 * update the fact and the date together.
 */
export const CHECKED_ON = '2026-11-17';

export const SOURCES = {
  btwDeadlines: {
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/uiterste-aangifte-en-betaaldatums',
    label: 'Belastingdienst: wanneer moeten btw-aangifte en betaling binnen zijn',
  },
  ibDeadline: {
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/belastingaangifte/content/wanneer-moet-ik-aangifte-doen',
    label: 'Belastingdienst: wanneer moet de aangifte inkomstenbelasting binnen zijn',
  },
  korAanmelden: {
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/aanmelden-kor',
    label: 'Belastingdienst: aanmelden voor de kleineondernemersregeling',
  },
  korAfmelden: {
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/afmelden-kor',
    label: 'Belastingdienst: afmelden voor de kleineondernemersregeling',
  },
  moneybirdBackup: {
    url: 'https://www.moneybird.nl/helpcenter/nl/articles/207252-back-up-maken-en-je-administratie-bewaren',
    label: 'Moneybird: back-up maken en je administratie bewaren',
  },
  moneybirdOpzeggen: {
    url: 'https://www.moneybird.nl/helpcenter/nl/articles/207468-account-of-pakket-opzeggen-of-verwijderen',
    label: 'Moneybird: account of pakket opzeggen of verwijderen',
  },
  moneybirdAgents: {
    url: 'https://www.moneybird.nl/agents/',
    label: 'Moneybird voor agents (MCP-koppeling)',
  },
  claudeConnectors: {
    url: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
    label: 'Claude: eigen connectors (remote MCP) per abonnement',
  },
  chatgptMcp: {
    url: 'https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt',
    label: 'OpenAI: eigen MCP-servers koppelen in ChatGPT',
  },
} as const;

/** The deadlines as the Belastingdienst states them; the year follows from the period. */
export const DEADLINES = {
  q4: '31 januari',
  q1: '30 april',
  ib: '1 mei',
  korWeeks: 4,
} as const;

export type Source = { url: string; label: string };

export const sourceList = (items: Source[], esc: (value: string) => string): string =>
  `<ul class="sources">${items.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>`;
