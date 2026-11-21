import { AGENT_SEED, AGENTS, ASSISTANT_GRID, ASSISTANTS, FAQS, LEDGER_START, type LedgerRow, SCENARIOS, type Step } from './landing-data.ts';

/**
 * The landing page, rebuilt from the design handoff in web/ (2026-11-16).
 * Everything renders as static HTML first; /site.js only animates it.
 * Where the design promised something Bookiz does not do, the text follows
 * the product (see the pull request that introduced this file).
 */
export type LandingInput = {
  esc: (value: string) => string;
  euro: (amount: number) => string;
  repoUrl: string;
  contactEmail: string;
  cloud: { open: boolean; priceYear: number; trialDays: number };
  dfy: { price: number; founding: number; seats: number; open: boolean };
  rulesYear: number;
  zelfstandigenaftrek: number;
  korLimit: number;
};

const LAUREL = '<path d="M16 3C4 12 3 32 15 43"></path><path d="M9 10L3 8M6 18L0 17M5 26L0 27M7 34L2 37M11 40L7 44"></path>';
const laurel = (side: 'l' | 'r') =>
  `<svg class="laurel${side === 'r' ? ' r' : ''}" width="20" height="46" viewBox="0 0 20 46" fill="none" stroke="#f5efe9" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${LAUREL}</svg>`;

export function mailto(address: string, subject: string): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}

function stepHtml(step: Step, assistantLogo: string, esc: LandingInput['esc']): string {
  if (step.t === 'user') {
    const attach = step.attach
      ? `<div class="attach"><span class="attach-thumb"></span><span><span>${esc(step.attach)}</span><small>foto · 1,2 MB</small></span></div>`
      : '';
    return `<div class="msg msg-user">${attach}<div class="bubble-user">${esc(step.text)}</div></div>`;
  }
  if (step.t === 'tool') {
    return `<div class="msg msg-tool"><span class="spinner"></span><span class="check">✓</span><span>bookiz.${esc(step.text)}</span><span class="detail">${esc(step.detail)}</span></div>`;
  }
  return `<div class="msg msg-bot"><span class="tile"><img src="${assistantLogo}" alt=""></span><div class="bubble-bot">${esc(step.text)}</div></div>`;
}

function ledgerHtml(row: LedgerRow, esc: LandingInput['esc']): string {
  return `<div class="lrow tone-${row.tone}"><span class="licon">${esc(row.icon)}</span><span class="lmain"><strong>${esc(row.label)}</strong><small>${esc(row.code)}</small></span><span class="lamount">${esc(row.amount)}</span></div>`;
}

export function landingBody(input: LandingInput): string {
  const { esc } = input;
  // Keep the euro sign on the same line as its amount.
  const euro = (amount: number) => input.euro(amount).replace('€ ', '€\u00a0');
  const demoAssistant = ASSISTANTS[1] as { name: string; logo: string };
  const first = SCENARIOS[0] as (typeof SCENARIOS)[number];
  // Cloud is sold per year only; the monthly figure is the same price, spread out.
  const perMonth = (input.cloud.priceYear / 12).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cloudNote = `Komt neer op € ${perMonth} per maand, jaarlijks gefactureerd. Excl. btw, eerste ${input.cloud.trialDays} dagen gratis.`;
  // Paying always goes through sign-in first, so the payment lands on the right account.
  const cloudButton = input.cloud.open
    ? `<a class="plan-btn orange" href="/app">Probeer ${input.cloud.trialDays} dagen gratis <span class="raquo">»</span></a>
          <a class="plan-sub" href="/app/betalen?plan=cloud">Of neem meteen een jaar</a>`
    : `<a class="plan-btn orange" href="${esc(mailto(input.contactEmail, 'Zet me op de lijst voor Bookiz Cloud'))}">Zet me op de lijst <span class="raquo">»</span></a>`;
  const dfyButton = input.dfy.open
    ? `<a class="plan-btn white" href="/app/betalen?plan=dfy">Neem Done For You <span class="raquo">»</span></a>`
    : `<a class="plan-btn white" href="${esc(mailto(input.contactEmail, 'Reservering Done For You'))}">Reserveer je plek <span class="raquo">»</span></a>`;
  const dfyFoot = input.dfy.open
    ? 'Done For You start zodra de samenwerking met een zelfstandige boekhouder rond is. Tot die start werkt Bookiz Cloud gewoon en krijg je op verzoek je hele betaling terug.'
    : 'Reserveren kost niets en verplicht je tot niets. Done For You start zodra de samenwerking met een zelfstandige boekhouder rond is.';

  const agentCards = AGENTS.map(
    (agent, i) => `<article class="agent" data-agent="${i}">
          <div class="agent-top"><span class="glyph">${agent.glyph}</span><span><h3>${esc(agent.name)}</h3><small>${esc(agent.role)}</small></span></div>
          <div class="agent-line"><span class="spinner"></span><span class="check">✓</span><span class="txt">Wacht op je assistent</span></div>
          <div class="bar"><span></span></div>
          <div class="tools">${agent.tools.map((tool) => `<span>${esc(tool)}</span>`).join('')}</div>
          <div class="agent-foot"><span class="status">Stand-by</span><span class="count"><span class="n">${AGENT_SEED[i]}</span> vandaag</span></div>
        </article>`,
  ).join('\n        ');

  return `<div class="page">
<main>
<section id="top" class="hero">
  <div class="hero-glow"></div>
  <svg class="deco squiggle" width="420" height="320" viewBox="0 0 420 320" fill="none" aria-hidden="true"><path d="M0 40C120 30 200 120 150 190C110 250 20 230 30 170C40 110 160 100 230 160C290 210 260 300 200 300C140 300 150 220 220 200C290 180 360 200 410 240" stroke="#f5efe9" stroke-width="3" stroke-linecap="round"></path></svg>
  <svg class="deco sparkle" width="120" height="140" viewBox="0 0 120 140" fill="none" aria-hidden="true"><path d="M60 6C64 52 70 64 114 70C70 76 64 88 60 134C56 88 50 76 6 70C50 64 56 52 60 6Z" stroke="#f5efe9" stroke-width="3" stroke-linejoin="round"></path></svg>
  <img class="deco float-a" src="/logo.png" alt="">
  <img class="deco float-b" src="/logo.png" alt="">

  <div class="hero-inner">
    <div class="badges">
      <div class="badge">${laurel('l')}<span class="badge-text"><small>Open source</small><strong>AGPL-3.0</strong></span>${laurel('r')}</div>
      <div class="badge">${laurel('l')}<span class="badge-text"><small>Belastingregels</small><strong>${input.rulesYear} met bron</strong></span>${laurel('r')}</div>
      <div class="badge">${laurel('l')}<span class="badge-text"><small>Self-host</small><strong>€ 0</strong></span>${laurel('r')}</div>
    </div>
    <h1 class="h1">Run je boekhouding<br>met <span class="rot" id="rot"><span class="rot-tile"><img id="rot-logo" src="${ASSISTANTS[0]?.logo}" alt=""></span><span class="rot-name" id="rot-name">${esc(ASSISTANTS[0]?.name ?? '')}</span></span></h1>
    <p class="hero-sub">Bookiz is boekhouding voor eenmanszaken met weinig facturen. Je zegt wat er gebeurde. Je assistent zet Bookiz aan het werk. Je facturen, bonnen en btw-aangifte kloppen, volgens regels die je zelf kunt nalezen.</p>
    <div class="cta-row">
      ${input.cloud.open ? `<a class="cta-primary" href="/app">Start ${input.cloud.trialDays} dagen gratis <span class="raquo">»</span></a>` : '<a class="cta-primary" href="#prijzen">Begin voor € 0 <span class="raquo">»</span></a>'}
      <a class="cta-secondary" href="#live"><span class="play-dot">▶</span>Bekijk de demo</a>
    </div>
  </div>

  <div class="live" id="live">
    <div class="live-label"><span class="pdot"></span>Demo: zo ziet een dag met Bookiz eruit</div>
    <div class="live-border"></div>
    <div class="live-card">
      <div class="live-top">
        <div class="dots"><span></span><span></span><span></span></div>
        <div class="scens" role="group" aria-label="Kies een voorbeeld">
          ${SCENARIOS.map((scenario, i) => `<button class="scen" type="button" data-scen="${i}" aria-pressed="${i === 0}"><small>0${i + 1}</small>${esc(scenario.label)}</button>`).join('\n          ')}
        </div>
        <span class="live-hint">klik of kijk mee</span>
      </div>
      <div class="live-body">
        <div class="chat">
          <div class="chat-head">
            <span class="tile"><img class="js-assistant-logo" src="${demoAssistant.logo}" alt=""></span>
            <span class="chat-name js-assistant-name">${esc(demoAssistant.name)}</span>
            <span class="chat-met">met</span>
            <span class="connected"><img src="/logo.png" alt="">Bookiz verbonden</span>
          </div>
          <div class="msgs" id="msgs" aria-live="polite">
            ${first.steps.map((step) => stepHtml(step, demoAssistant.logo, esc)).join('\n            ')}
          </div>
          <div class="composer"><span>Vraag <span class="js-assistant-name">${esc(demoAssistant.name)}</span> iets over je administratie…</span><span class="send">↑</span></div>
        </div>
        <div class="books">
          <div class="books-head"><span class="mono">Jouw boeken · voorbeeld</span><span class="books-live"><span class="pdot green"></span>bijgewerkt</span></div>
          <div class="ledger" id="ledger">
            ${ledgerHtml(first.ledger, esc)}
            ${ledgerHtml(LEDGER_START, esc)}
          </div>
          <div class="deadline"><small>Volgende deadline</small><strong>Btw Q4 · 31 januari</strong><span>Cijfers per rubriek staan klaar.</span></div>
          <p class="books-foot">Je assistent schrijft de zinnen. De bedragen en de belastingregels komen uit Bookiz.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="logos">
    <p>Te koppelen aan assistenten die MCP ondersteunen, zoals</p>
    <div class="logo-row">
      ${ASSISTANT_GRID.map((item) => `<span class="logo-tile" title="${esc(item.name)}"><img src="${item.logo}" alt="${esc(item.name)}"></span>`).join('\n      ')}
    </div>
  </div>
</section>

<section id="pijn" class="pain cream">
  <div class="inner">
    <div class="intro">
      <div class="eyebrow dark">Herken je dit?</div>
      <h2 class="h2">Je bent ondernemer. <span class="hl">Geen boekhouder.</span></h2>
      <p>Je administratie is een handvol facturen, een stapel bonnetjes en vier btw-aangiftes per jaar. Toch voelt het elke keer als een berg.</p>
    </div>
    <div class="notes">
      <div class="note n1"><strong>“Waarom betaal ik hier elke maand voor?”</strong><p>Boekhoudpakketten zijn gebouwd en geprijsd voor bedrijven tien keer zo groot. Bankkoppelingen, voorraad, salarissen: jij gebruikt er niets van.</p></div>
      <div class="note n2"><strong>“Welke rubriek was dit ook alweer?”</strong><p>Vier keer per jaar die knoop in je maag. Klopt het wel? Mis ik iets? Wat als de Belastingdienst belt?</p></div>
      <div class="note n3"><strong>“Dat bonnetje zit ergens in mijn jaszak.”</strong><p>Bonnen in je mail, je tas en je camerarol. En je moet ze zeven jaar kunnen laten zien.</p></div>
      <div class="note n4"><strong>“Ik betaal wel iemand om ernaar te kijken.”</strong><p>Elk voorjaar een paar honderd euro, omdat je je eigen cijfers niet meer vertrouwt.</p></div>
    </div>
  </div>
</section>

<section class="sec pk">
  <div class="sec-glow"></div>
  <div class="inner">
    <div class="sec-head">
      <div class="eyebrow">Geen vitamine. Een pijnstiller.</div>
      <h2 class="h2">Je zegt wat er gebeurde. <span class="hl">Bookiz regelt de rest.</span></h2>
      <p class="lede">Geen nieuwe app. Geen nieuwe gewoonte. Eén zin in de chat die je toch al open hebt.</p>
    </div>
    <div class="cmp" role="table" aria-label="Zonder en met Bookiz">
      <div class="cmp-row cmp-head" role="row"><span role="columnheader"></span><span role="columnheader">Zonder Bookiz</span><span class="with" role="columnheader">Met Bookiz</span></div>
      ${[
        ['Bonnetjes', 'Schoenendoos tot maart, dan een avond overtypen.', 'Foto in de chat. Geboekt met de juiste btw, het origineel gaat naar je mailbox.', '“Lunch met klant, zelf betaald.” 📎'],
        ['Facturen', 'Vorige factuur kopiëren, nummer ophogen, hopen dat alles erop staat.', 'Alle wettelijke velden, doorlopende nummers, pdf en e-mail.', '“Factuur voor Klant BV, tien uur à 85 euro.”'],
        ['Btw-aangifte', 'Een avond googelen welk bedrag in welke rubriek hoort.', 'Per rubriek in hele euro’s, met de bonnen achter elk getal. Overnemen en klaar.', '“Hoe sta ik ervoor?”'],
        ['Jaarafsluiting', 'Een paar honderd euro voor iemand die je cijfers nakijkt.', 'Winst, aftrekposten en wat je opzij moet zetten voor inkomstenbelasting en Zvw.', '“Wat moet ik opzijzetten?”'],
        ['Kosten', 'Elke maand een abonnement op knoppen die je nooit aanraakt.', `Gratis als je zelf host. ${euro(input.cloud.priceYear)} per jaar als wij het doen.`, 'git clone · npm install · klaar'],
      ]
        .map(
          ([name, without, withText, say]) =>
            `<div class="cmp-row" role="row"><span class="cmp-name" role="rowheader">${esc(name as string)}</span><span class="cmp-without" role="cell">${esc(without as string)}</span><span class="cmp-with" role="cell"><span>${esc(withText as string)}</span><span class="say">${esc(say as string)}</span></span></div>`,
        )
        .join('\n      ')}
    </div>
  </div>
</section>

<section class="asst">
  <div class="inner wide-inner">
    <h2 class="h2"><span class="circled">Jouw<svg viewBox="0 0 200 90" fill="none" preserveAspectRatio="none" aria-hidden="true"><path d="M118 8C64 0 10 14 8 44C6 74 92 86 152 74C202 64 200 22 150 10C120 3 84 6 60 12" stroke="#fa4901" stroke-width="3.2" stroke-linecap="round"></path></svg></span> assistent.<br>Onze rekenregels.</h2>
    <p class="lede">Bookiz is een MCP-server. Je koppelt hem één keer aan je assistent, en vanaf dat moment kun je gewoon vragen.</p>
    <div class="asst-grid">
      <div class="asst-card gpt">
        <div class="asst-title"><span class="tile"><img src="/logos/chatgpt.png" alt=""></span><h3>Via ChatGPT</h3></div>
        <p>Vraag om een factuur. ChatGPT schrijft de zinnen, Bookiz levert de bedragen.</p>
        <div class="mock-frame" aria-hidden="true">
          <div class="mock">
            <div class="mock-side"><img src="/logos/chatgpt.png" alt=""><span>+ Nieuwe chat</span><span>Chats zoeken</span><span>Afbeeldingen</span><span class="skel first"></span><span class="skel w80"></span><span class="skel w60"></span></div>
            <div class="mock-main">
              <span class="mock-title">ChatGPT</span>
              <span class="mock-user">Maak een factuur voor Klant BV: tien uur advies à 85 euro.</span>
              <span class="mock-tool">● bookiz.create_invoice</span>
              <div class="inv-card">
                <div class="inv-head"><strong>Factuur · concept</strong><span>Klant BV</span></div>
                <div class="inv-line"><span>Advies · 10 × € 85,00</span><span>€ 850,00</span></div>
                <div class="inv-line"><span>Btw 21%</span><span>€ 178,50</span></div>
                <div class="inv-total"><span>Totaal</span><span>€ 1.028,50</span></div>
                <div class="inv-actions"><span>Definitief maken</span><span>Aanpassen</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="asst-card cl">
        <div class="asst-title"><span class="tile"><img src="/logos/claude.png" alt=""></span><h3>Via Claude</h3></div>
        <p>Vertel wat je deed. Claude vraagt door als iets ontbreekt, Bookiz boekt.</p>
        <div class="mock-frame" aria-hidden="true">
          <div class="mock">
            <div class="mock-side"><span class="cl-logo"><img src="/logos/claude.png" alt="">Claude</span><span>+ Nieuwe chat</span><span>Projecten</span><span>Artifacts</span><span class="cl-recent">Recent</span><span class="skel"></span><span class="skel w75"></span></div>
            <div class="mock-main">
              <span class="mock-user">Vandaag 42 km gereden naar een klant in Amersfoort, met mijn eigen auto.</span>
              <span class="mock-tool">Bookiz gebruikt ›</span>
              <span class="mock-reply">Geboekt: 42 zakelijke kilometers met je eigen auto. Het bedrag telt mee als kosten in je jaaroverzicht.</span>
              <span class="mock-reply">Zal ik ook de lunch van vandaag boeken? Stuur dan een foto van de bon.</span>
              <div class="mock-input"><span>Antwoord Claude…</span><span>↑</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="wide">
      <div class="wide-copy">
        <span class="prompt-tile">&gt;_</span>
        <h3>Via Claude Code, Codex of Cursor</h3>
        <p>Draai Bookiz gratis op je eigen computer. Je data staat in <span class="mono">~/.bookiz</span>. Alleen Node.js nodig.</p>
        <div class="chips"><span class="chip"><img src="/logos/claudecode.png" alt="">Claude Code</span><span class="chip"><img src="/logos/openai.png" alt="">Codex</span><span class="chip"><img src="/logos/cursor.png" alt="">Cursor</span></div>
      </div>
      <div class="term">
        <div class="term-bar"><i></i><i></i><i></i><small>terminal</small></div>
<pre><span class="t-mute">$</span> git clone ${esc(input.repoUrl)}.git
<span class="t-mute">$</span> cd bookiz &amp;&amp; npm install
<span class="t-mute">$</span> claude mcp add bookiz -- node ~/bookiz/src/cli.ts
<span class="t-ok">✓</span> bookiz toegevoegd · <span class="t-o">24 tools</span>

<span class="t-o">&gt;</span> Richt mijn administratie in. Ik ben Studio Voorbeeld, KvK 12345678.
  <span class="t-o">●</span> bookiz.setup_business <span class="t-ok">✓</span>
  Klaar. Je eerste factuur krijgt nummer ${input.rulesYear}-001.</pre>
      </div>
    </div>
  </div>
</section>

<section id="agents" class="agents">
  <div class="dotgrid"></div>
  <div class="agents-inner">
    <div class="sec-head">
      <div class="eyebrow">Achter de schermen</div>
      <h2 class="h2">Acht agents. <span class="hl">Eén gesprek.</span></h2>
      <p class="lede">Jij praat met je assistent. Die zet de juiste Bookiz-agent aan het werk. De bedragen komen uit vaste regels, nooit uit een gok: zelfde invoer, zelfde boeken.</p>
    </div>
    <div class="flow">
      <span class="flow-pill"><span class="av"><img src="/founder-sm.jpg" alt=""></span>Jij</span>
      <span class="flow-line"></span>
      <span class="flow-pill"><span class="tile"><img class="js-assistant-logo" src="${demoAssistant.logo}" alt=""></span><span class="js-assistant-name">${esc(demoAssistant.name)}</span></span>
      <span class="flow-line"></span>
      <span class="flow-pill bz"><img src="/logo.png" alt="">Bookiz</span>
      <span class="flow-line"></span>
      <span class="flow-pill busy" id="busy">0 agents aan het werk</span>
    </div>
    <div class="agents-layout">
      <div class="agent-grid">
        ${agentCards}
      </div>
      <div class="feed-panel">
        <div class="feed-head"><span class="mono">Activiteit · voorbeeld</span><span class="tag"><span class="pdot"></span>nagespeeld</span></div>
        <ol class="feed" id="feed" reversed></ol>
        <div class="feed-foot"><span>In dit voorbeeld afgehandeld</span><strong><span id="total">${AGENT_SEED.reduce((a, b) => a + b, 0)}</span> taken</strong></div>
      </div>
    </div>
    <p class="sim-note">Nagespeeld voorbeeld. De acht agents zijn de 24 tools van Bookiz, per taak gegroepeerd; de tellers zijn geen gebruikscijfers.</p>
  </div>
</section>

<section id="demo" class="demo center">
  <h2 class="h2">Bekijk Bookiz in actie</h2>
  <p class="lede">Van eerste bonnetje tot btw-aangifte, in één gesprek.</p>
  <a class="video" href="#live" aria-label="De video volgt; bekijk de demo bovenaan de pagina">
    <img class="spinlogo" src="/logo.png" alt="">
    <span class="top-word">BOEKHOUDEN</span>
    <span class="face"><img src="/founder.jpg" alt="Mees Tierolff"></span>
    <span class="bottom-word">IN ÉÉN CHAT</span>
    <span class="play"><span></span></span>
    <span class="tag">video volgt</span>
  </a>
</section>

<section id="voorwie" class="who">
  <div class="inner">
    <h2 class="h2 center">Voor wie is Bookiz?</h2>
    <div class="who-grid">
      <div>
        <svg width="76" height="76" viewBox="0 0 64 64" fill="none" stroke="#fa4901" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 7.5C17.4 24 16.6 42 17.2 58L23 54.4L29.6 58.6L35.8 54.2L42 58.4L47.6 54.6C47 39 47.8 22 47.2 7C37 7.8 27 6.8 17 7.5Z"></path><path d="M24 20.5C30 20 36 20.8 40.5 20.2M24 29.4C30 29 35 29.6 40 29.1M24 38.6C28 38.2 31 38.6 34 38.4"></path></svg>
        <h3>Zzp'ers met weinig facturen</h3>
        <p>Een eenmanszaak in diensten, een handvol facturen per maand. Geen voorraad, geen personeel, geen zin in een pakket.</p>
      </div>
      <div>
        <svg width="76" height="76" viewBox="0 0 64 64" fill="none" stroke="#ff8a52" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 15C9.6 10 13 7.4 18.6 7.6C30 7 42 8 53 7.4C57.6 7.6 60.4 10.4 60 15C60.4 23 59.6 31 60.2 38C60 42.6 57 45.4 52.6 45.2C44 45.6 36 44.8 28 45.4L15.6 56L18 45.2C13 45.6 10 42.6 10.2 38C10.6 30 9.6 22 10 15Z"></path><path d="M24 26.5h.1M35 26.2h.1M46 26.4h.1"></path></svg>
        <h3>Wie al met AI werkt</h3>
        <p>Je hebt Claude, ChatGPT of Codex toch al de hele dag open. Nu doet die ook je administratie, zonder dat je een nieuwe app leert.</p>
      </div>
      <div>
        <svg width="76" height="76" viewBox="0 0 64 64" fill="none" stroke="#ffb592" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.4 13C7 10.4 9 8.6 11.6 8.8C25 8.2 39 9 52.4 8.4C55 8.6 56.8 10.6 56.6 13C57 25 56.2 38 56.8 50.6C57 53.2 55 55.2 52.4 55C39 55.6 25 54.8 11.6 55.4C9 55.2 7.2 53.4 7.4 50.8C7 38 7.8 25 7.4 13Z"></path><path d="M18 26L26.4 32.4L18.2 38.6M31 41.2C35 40.8 39 41.4 44 41"></path></svg>
        <h3>Techneuten die zelf hosten</h3>
        <p>Open source, je eigen Postgres, je eigen server. Alles exporteer je als één JSON-bestand. Je zit nergens aan vast.</p>
      </div>
    </div>
    <p class="honest">Eerlijk is eerlijk: heb je een bv, werk je met het kasstelsel of de margeregeling, of verkoop je goederen over de grens? Dan is Bookiz nog niet voor jou.</p>
  </div>
</section>

<section class="feats">
  <div class="inner wide-inner">
    <h2 class="h2">Alles wat een eenmanszaak nodig heeft. <span class="underlined">Niets meer.<svg viewBox="0 0 420 30" fill="none" preserveAspectRatio="none" aria-hidden="true"><path d="M4 10C120 2 260 4 416 8" stroke="#fa4901" stroke-width="4" stroke-linecap="round"></path><path d="M70 23C170 17 280 17 380 21" stroke="#fa4901" stroke-width="4" stroke-linecap="round"></path></svg></span></h2>
    <div class="feat-hero">
      <div class="feat-hero-copy">
        <span class="tag-pill dark">FACTUREN</span>
        <h3>Een factuur in één zin</h3>
        <p>Alle wettelijke velden, doorlopende nummers, pdf en e-mail. Een definitieve factuur wordt nooit aangepast, alleen gecrediteerd. Terugkerende facturen staan op hun datum als concept klaar.</p>
      </div>
      <div class="paper-wrap" aria-hidden="true">
        <div class="paper">
          <div class="paper-top"><span><strong>Studio Voorbeeld</strong><span class="grey">KvK 12345678</span><span class="grey">NL000099998B57</span></span><span><span class="big">FACTUUR</span><span class="mono">${input.rulesYear}-014</span><span class="grey">16-11-${input.rulesYear}</span></span></div>
          <div class="paper-to grey">Aan<b>Klant BV</b></div>
          <div class="paper-lines"><div class="lbl"><span>Omschrijving</span><span>Bedrag</span></div><div class="row"><span>Advies · 10 uur × € 85,00</span><span>€ 850,00</span></div></div>
          <div class="paper-lines"><div class="row sub"><span>Subtotaal</span><span>€ 850,00</span></div><div class="row sub"><span>Btw 21%</span><span>€ 178,50</span></div><div class="row total"><span>Totaal</span><span>€ 1.028,50</span></div></div>
          <div class="paper-pay"><span>Betalen binnen 14 dagen op NL00 BANK 0123 4567 89</span><b>✓ verstuurd</b></div>
        </div>
      </div>
    </div>
    <div class="feat-grid">
      <div class="feat">
        <span class="tag-pill">BTW-AANGIFTE</span>
        <h3>Per rubriek. Overnemen en klaar.</h3>
        <div class="rub"><div><b>1a</b><span>Omzet hoog tarief</span>€ 1.785</div><div><b>4a</b><span>Diensten buiten de EU</span>€ 25</div><div><b>5b</b><span>Voorbelasting</span>− € 337</div><div><b>5g</b><span>Te betalen · vóór 31 jan</span>€ 1.473</div></div>
      </div>
      <div class="feat light">
        <span class="tag-pill ink">REGELS ALS DATA</span>
        <h3>Elke regel met bron. Je boekhouder leest mee.</h3>
<pre class="json"><span class="j-k">"zelfstandigenaftrek"</span>: {
  <span class="j-p">"value"</span>: <span class="j-n">${input.zelfstandigenaftrek}</span>,
  <span class="j-p">"source"</span>: <span class="j-s">"belastingdienst.nl/…"</span>,
  <span class="j-p">"quote"</span>: <span class="j-s">"…in ${input.rulesYear} een bedrag
    van ${esc(euro(input.zelfstandigenaftrek))}."</span>
}</pre>
        <p><a href="/belastingregels-${input.rulesYear}/">Alle regels voor ${input.rulesYear}, met het citaat uit de bron</a></p>
      </div>
      <div class="feat">
        <span class="tag-pill">KOR</span>
        <h3>De grens van ${esc(euro(input.korLimit))} in het oog</h3>
        <p>Facturen zonder btw, kosten inclusief btw. De factuur die over de grens zou gaan, weigert Bookiz.</p>
        <div class="kor" aria-hidden="true"><div class="kor-nums"><span>€ 14.200</span><span>${esc(euro(input.korLimit))}</span></div><div class="kor-track"><span></span></div></div>
      </div>
      <div class="feat">
        <span class="tag-pill">BONNEN</span>
        <h3>Het origineel in je eigen mailbox</h3>
        <p>Zeven jaar bewaarplicht, zonder schoenendoos. Bookiz bewaart een vingerafdruk, jij het bestand.</p>
        <div class="mailchip" aria-hidden="true"><img src="/logos/gmail.png" alt=""><span><strong>[Bookiz bon] K${input.rulesYear}-007 · Coolblue · € 249,00</strong><small>bon-coolblue.jpg · 1 bijlage</small></span></div>
      </div>
      <div class="feat">
        <span class="tag-pill">JAAROVERZICHT</span>
        <h3>Weten wat je opzij moet zetten</h3>
        <div class="checks"><div><span>Zelfstandigenaftrek</span><span class="ok">✓</span></div><div><span>Startersaftrek</span><span class="ok">✓</span></div><div><span>MKB-winstvrijstelling</span><span class="ok">✓</span></div><div><span>Kleinschaligheidsinvesteringsaftrek</span><span class="ok">✓</span></div><div><span>Opzijzetten voor IB + Zvw</span><span>€ 6.980</span></div></div>
      </div>
      <div class="feat ember">
        <span class="tag-pill glass">OVERSTAPPEN</span>
        <h3>Van je oude pakket naar Bookiz</h3>
        <p>Klanten, openstaande facturen, activa en je factuurnummering. Weg willen? Een heel jaar als één bestand. <a href="/overstappen/">Zo stap je over per 1 januari</a>.</p>
        <div class="switch-row"><span class="sq"><img src="/logos/moneybird.png" alt="Moneybird"></span><span class="sq"><img src="/logos/eboekhouden.png" alt="e-Boekhouden"></span><span class="sq"><img src="/logos/sheets.png" alt="Spreadsheet"></span><span class="arrow">→</span><span class="sq bz"><img src="/logo.png" alt="Bookiz"></span></div>
      </div>
    </div>
  </div>
</section>

<section id="founder" class="founder cream">
  <img class="spinlogo" src="/logo.png" alt="">
  <div class="founder-inner">
    <div class="polaroid-wrap">
      <div class="tape"></div>
      <figure class="polaroid"><img src="/founder.jpg" alt="Mees Tierolff" width="720" height="716"><figcaption>Mees, maker van Bookiz</figcaption></figure>
    </div>
    <div class="letter">
      <div class="eyebrow dark">Een briefje van de maker</div>
      <h2 class="h2">“Mensen betalen te veel voor boekhoudsoftware. <span class="hl">Ik heb dat gefixt.</span>”</h2>
      <div class="letter-body">
        <p>Ik heb zelf een eenmanszaak. Mijn hele administratie is een handvol facturen, een stapel bonnetjes en vier btw-aangiftes per jaar. Toch betaalde ik elke maand voor een pakket vol knoppen die ik nooit aanraakte.</p>
        <p>Dus bouwde ik het omgekeerde. Bookiz is met opzet klein. Geen nieuwe app, maar de assistent die je al gebruikt. Elke belastingregel staat open op GitHub, met de pagina van de Belastingdienst waar hij vandaan komt. En wil je weg, dan neem je alles mee in één bestand.</p>
        <p>Vind je een fout getal? Dat is het waardevolste issue dat je kunt openen.</p>
      </div>
      <div class="sign"><span class="hand">Mees</span><span class="who-sign"><b>Mees Tierolff</b><span>Founder of Bookiz</span></span></div>
    </div>
  </div>
</section>

<section id="prijzen" class="pricing center">
  <div class="glow"></div>
  <div class="inner">
    <h2 class="h2">Eerlijke prijzen.</h2>
    <p class="lede">Gratis als je het zelf doet. Een boekhouder erbij als je het helemaal kwijt wilt.</p>
    <div class="plans">
      <div class="plan">
        <div class="plan-head"><h3>Self-host</h3><span class="state now">NU BESCHIKBAAR</span></div>
        <div class="price"><strong>€ 0</strong><span>voor altijd</span></div>
        <p class="plan-note">Alles uit de repository, op je eigen computer of server.</p>
        <a class="plan-btn outline" href="${esc(input.repoUrl)}"><img src="/logos/github-white.svg" alt="">Installeer via GitHub</a>
        <ul class="plan-list"><li>Alle 24 tools</li><li>Belastingregels ${input.rulesYear}, met bron</li><li>Je data in ~/.bookiz</li><li>Export als één bestand</li><li>Open source, AGPL-3.0</li></ul>
      </div>
      <div class="plan-ring">
        <span class="ribbon">AANRADER</span>
        <div class="plan">
          <div class="plan-head"><h3>Cloud</h3><span class="state soon">${input.cloud.open ? 'NU OPEN' : 'BINNENKORT'}</span></div>
          <div class="price"><strong>${esc(euro(input.cloud.priceYear))}</strong><span>/jaar</span></div>
          <p class="plan-note">${esc(cloudNote)}</p>
          ${cloudButton}
          <ul class="plan-list"><li>Alles uit Self-host</li><li>Wij hosten en houden het up-to-date</li><li>Je assistent logt in met je e-mailadres</li><li>Bonnen uploaden vanaf je telefoon</li><li>Eigen, afgeschermd databaseschema</li></ul>
        </div>
      </div>
      <div class="plan dfy">
        <div class="plan-head"><h3>Done For You</h3><span class="state pre">PRESALE</span></div>
        <div class="price"><strong>${esc(euro(input.dfy.founding))}</strong><span>/jaar</span><s>${esc(euro(input.dfy.price))}</s></div>
        <p class="plan-note"><b>Founding-prijs voor de eerste ${input.dfy.seats}.</b> Daarna ${esc(euro(input.dfy.price))} per jaar. Excl. btw.</p>
        ${dfyButton}
        <ul class="plan-list"><li>Alles uit Cloud</li><li>Een echte boekhouder die meekijkt</li><li>Je btw-aangiftes, voor je ingediend</li><li>Inclusief je aangifte inkomstenbelasting</li><li>Jij praat, je boekhouder dient in</li></ul>
      </div>
    </div>
    <p class="price-foot">${esc(dfyFoot)}</p>
  </div>
</section>

<section id="faq" class="faq">
  <h2 class="h2 center">Veelgestelde vragen</h2>
  <div class="faq-list">
    ${FAQS.map(
      ([question, answer], i) =>
        `<details class="faq-item" name="faq"${i === 0 ? ' open' : ''}><summary><span>${esc(question)}</span><span class="plus" aria-hidden="true">+</span></summary><p>${esc(answer)}</p></details>`,
    ).join('\n    ')}
  </div>
</section>

<section class="closing">
  <div class="closing-block">
    <img class="spinlogo" src="/logo.png" alt="">
    <div class="closing-copy">
      <h2>Klaar met die knoop in je maag?</h2>
      <p>Installeer Bookiz gratis, of zet je op de lijst voor Cloud. Je eerste factuur is één zin verwijderd.</p>
    </div>
    <div class="closing-cta">
      <svg width="150" height="90" viewBox="0 0 150 90" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 18C30 -4 70 30 52 58C40 78 18 54 46 46C76 38 106 50 136 46"></path><path d="M122 34L138 46L124 60"></path></svg>
      ${input.cloud.open ? `<a class="cta-big" href="/app">Start ${input.cloud.trialDays} dagen gratis <span class="raquo">»</span></a>` : '<a class="cta-big" href="#prijzen">Begin voor € 0 <span class="raquo">»</span></a>'}
    </div>
  </div>
</section>
</main>

<a class="ask" href="${esc(mailto(input.contactEmail, 'Vraag over Bookiz'))}"><span class="av"><img src="/founder-sm.jpg" alt=""></span><span>Vraag het Mees</span></a>
</div>`;
}

/** What /site.js needs to animate the page; the static HTML above is its first frame. */
export function landingData(): string {
  return JSON.stringify({ assistants: ASSISTANTS, scenarios: SCENARIOS, start: LEDGER_START, agents: AGENTS, seed: AGENT_SEED }).replace(/</g, '\\u003c');
}

export const landingFaq = FAQS;
