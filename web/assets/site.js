// Bookiz site: small enhancements on top of a page that already works without them.
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------- FAQ: one answer open at a time, also where <details name> is unsupported ----------
  const faqs = $$('.faq-item');
  faqs.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (item.open) faqs.forEach((other) => other !== item && (other.open = false));
    });
  });

  const dataNode = document.getElementById('bz-data');
  if (!dataNode) return;
  let data;
  try {
    data = JSON.parse(dataNode.textContent);
  } catch {
    return;
  }

  // ---------- Rotating assistant name ----------
  let word = 0;
  const rot = document.getElementById('rot');
  const rotLogo = document.getElementById('rot-logo');
  const rotName = document.getElementById('rot-name');
  // While the headline says "AI agents", the demo shows the first real assistant.
  const demoAssistant = () => data.assistants[word === 0 ? 1 : word];
  const showAssistant = () => {
    const current = data.assistants[word];
    rotLogo.src = current.logo;
    rotName.textContent = current.name;
    const demo = demoAssistant();
    $$('.js-assistant-name').forEach((node) => (node.textContent = demo.name));
    $$('.js-assistant-logo').forEach((node) => (node.src = demo.logo));
  };
  if (rot && rotLogo && rotName && !reduce) {
    setInterval(() => {
      if (document.hidden) return;
      rot.classList.add('out');
      setTimeout(() => {
        word = (word + 1) % data.assistants.length;
        showAssistant();
        rot.classList.remove('out');
      }, 280);
    }, 2600);
  }

  // ---------- Demo chat ----------
  const msgs = document.getElementById('msgs');
  const ledger = document.getElementById('ledger');
  const buttons = $$('[data-scen]');
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clear = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  const renderStep = (step, running) => {
    if (step.t === 'user') {
      const box = el('div', 'msg msg-user');
      if (step.attach) {
        const attach = el('div', 'attach');
        attach.append(el('span', 'attach-thumb'));
        const label = el('span');
        label.append(el('span', '', step.attach), el('small', '', 'foto · 1,2 MB'));
        attach.append(label);
        box.append(attach);
      }
      box.append(el('div', 'bubble-user', step.text));
      return box;
    }
    if (step.t === 'tool') {
      const box = el('div', `msg msg-tool${running ? ' running' : ''}`);
      box.append(el('span', 'spinner'), el('span', 'check', '✓'), el('span', '', `bookiz.${step.text}`), el('span', 'detail', step.detail));
      return box;
    }
    const box = el('div', 'msg msg-bot');
    const tile = el('span', 'tile');
    const img = el('img');
    img.src = demoAssistant().logo;
    img.alt = '';
    tile.append(img);
    box.append(tile, el('div', 'bubble-bot', step.text));
    return box;
  };

  const renderLedger = (row) => {
    const box = el('div', `lrow tone-${row.tone}`);
    const main = el('span', 'lmain');
    main.append(el('strong', '', row.label), el('small', '', row.code));
    box.append(el('span', 'licon', row.icon), main, el('span', 'lamount', row.amount));
    return box;
  };

  const addLedger = (row) => {
    ledger.prepend(renderLedger(row));
    while (ledger.children.length > 4) ledger.lastElementChild.remove();
  };

  const typing = () => {
    const box = el('div', 'typing');
    box.append(el('span'), el('span'), el('span'));
    return box;
  };

  const run = (index, autoplay) => {
    clear();
    const scenario = data.scenarios[index];
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    msgs.replaceChildren();
    if (reduce) {
      // No motion: show the finished conversation at once.
      scenario.steps.forEach((step) => msgs.append(renderStep(step, false)));
      addLedger(scenario.ledger);
      return;
    }
    let t = 600;
    scenario.steps.forEach((step) => {
      if (step.t === 'user') {
        later(() => msgs.append(renderStep(step, false)), t);
        t += 1300;
      } else if (step.t === 'tool') {
        let node;
        later(() => msgs.append((node = renderStep(step, true))), t);
        t += 900;
        later(() => node && node.classList.remove('running'), t);
        t += 250;
      } else {
        let dots;
        later(() => msgs.append((dots = typing())), t);
        t += 1200;
        later(() => {
          if (dots) dots.remove();
          msgs.append(renderStep(step, false));
        }, t);
        t += 1700;
      }
    });
    later(() => addLedger(scenario.ledger), t - 1500);
    if (autoplay) later(() => run((index + 1) % data.scenarios.length, true), t + 2600);
  };

  if (msgs && ledger && buttons.length) {
    buttons.forEach((button) => button.addEventListener('click', () => run(Number(button.dataset.scen), !reduce)));
    if (!reduce) {
      // The page opens on the finished first scenario; start the loop with the second.
      ledger.firstElementChild && ledger.firstElementChild.remove();
      run(0, true);
    }
  }

  // ---------- Agents (a replayed example, not usage figures) ----------
  const cards = $$('[data-agent]');
  const feed = document.getElementById('feed');
  const busy = document.getElementById('busy');
  const total = document.getElementById('total');
  if (!cards.length || !feed) return;
  const agents = data.agents;
  const seed = data.seed;
  const runs = agents.map(() => 0);
  let working = [0, 3];
  let tick = 0;
  const seedTotal = seed.reduce((a, b) => a + b, 0);
  const pad = (n) => String(n).padStart(2, '0');

  const step = () => {
    working.forEach((w) => runs[w]++);
    tick += 1;
    const a = (tick * 5) % agents.length;
    let b = (tick * 3 + 2) % agents.length;
    if (b === a) b = (b + 1) % agents.length;
    working = [a, b];
    const base = 9 * 3600 + 41 * 60 + tick * 13;
    const time = `${pad(Math.floor(base / 3600) % 24)}:${pad(Math.floor(base / 60) % 60)}:${pad(base % 60)}`;
    working.forEach((w) => {
      const agent = agents[w];
      const row = el('li');
      const stamp = el('time', '', time);
      const text = el('span');
      text.append(el('b', '', agent.name.replace('-agent', '')), document.createTextNode(' '), el('span', '', agent.logs[runs[w] % agent.logs.length]));
      row.append(stamp, text);
      feed.prepend(row);
    });
    while (feed.children.length > 12) feed.lastElementChild.remove();
    Array.from(feed.children).forEach((row, i) => (row.style.opacity = String(Math.max(0.25, 1 - i * 0.07))));

    cards.forEach((card, i) => {
      const isWorking = working.includes(i);
      const n = runs[i];
      const agent = agents[i];
      card.classList.toggle('working', isWorking);
      card.classList.toggle('done', !isWorking && n > 0);
      $('.txt', card).textContent = isWorking ? agent.logs[n % agent.logs.length] : n > 0 ? agent.logs[(n - 1) % agent.logs.length] : 'Wacht op je assistent';
      $('.status', card).textContent = isWorking ? 'Aan het werk' : n > 0 ? 'Klaar' : 'Stand-by';
      $('.n', card).textContent = String(seed[i] + n);
    });
    busy.textContent = `${working.length} agents aan het werk`;
    total.textContent = String(seedTotal + runs.reduce((x, y) => x + y, 0));
  };

  step();
  if (!reduce) {
    const loop = () => {
      if (!document.hidden) step();
      setTimeout(loop, 1900);
    };
    setTimeout(loop, 1900);
  }
})();
