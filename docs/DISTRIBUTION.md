# Distribution: first wave

Started 19 November 2026. Owner and approver of every outbound step: Mees.
Nothing in this document is posted, sent or submitted by an agent; agents
research and draft, the owner decides and publishes.

## Who first

HYPOTHESIS, chosen by the owner on 19 November 2026: Dutch sole proprietors
(eenmanszaak, zzp) who send few invoices **and already use Claude**.

The second half is not a preference but a constraint. Today Bookiz connects
to Claude (web, desktop, mobile; the free plan allows one custom connector),
Claude Code, Codex and Cursor. ChatGPT only accepts it on Business,
Enterprise and Edu (`docs/DIRECTORIES.md`). Someone without one of these
cannot start, however well they fit.

Strongest sub-groups, all HYPOTHESIS until a conversation confirms them:

- a business next to a job, a handful of invoices a year;
- starters and KOR users, under € 20.000 turnover;
- consultants, developers and designers with one to three clients;
- tech-savvy people who prefer open source they can host themselves.

## What we may say, and what each claim needs first

Every public sentence must be true today. The left column is what a post or
reply may say; the right column is its source or the proof still missing.

| Claim | Status |
| --- | --- |
| Open source (AGPL), tax rules as data with the Belastingdienst quote (MIT) | True: README, `rules/` |
| Every rule's source is checked every night | True: `rules-sources` workflow, first run green on 19 November 2026 |
| No AI inside: the assistant supplies facts, a fixed engine applies the rules | True: README |
| Cloud € 99 per year excl. btw, first 30 days free; self-host free | True: `web/site.json`, open |
| Done for you € 399 per year excl. btw for the first 50, then € 499 | True: `web/site.json`, presale |
| "Works with assistants that support remote MCP servers" | True |
| "Works with Claude" | True since 21 November 2026: the owner booked K2026-001 with a photo through Claude on the live server. The original goes in once more through the upload link, because Claude does not hand files to a remote server |
| "Install it yourself in Claude Code" | **Needs proof:** one `finalize_invoice` in Claude Code against a throwaway data folder (also tests the new confirmation form) |
| "Switch from Moneybird and carry on" | **Needs proof:** one real Moneybird export through `import_opening_state`, outstanding amount checked. Until then: "overstappen kan per 1 januari of per kwartaal; zie boekiehouder.nl/overstappen" |
| An Excel or CSV export per year for the bookkeeper (Inkomsten, Uitgaven), plus a full export with returns, year report and audit log | True: Mijn Bookiz, "Je gegevens meenemen" |
| "Geef je bankexport (CSV) aan Claude: hij registreert betalingen en noemt de afschrijvingen zonder bon" | **Needs proof:** the owner runs one month of his own bank CSV through Claude once. Bookiz has no bank import; Claude uses the existing tools |
| Customers, reviews, time saved, accuracy | **None exist.** Do not say or imply any |

Every post says plainly that Bookiz is early (0.1) and that the maker is
writing.

## Order

The owner has no LinkedIn audience or warm network to start from, and posts
on Reddit and forums. So the usual order (warm, content, cold, paid) becomes:

1. **Proof.** The two owner tests above. Without them the strongest sentence,
   "works with Claude", cannot be used.
2. **Listings that need no audience.** People looking for connectors find
   Bookiz without anyone posting. See "Listings".
3. **Be useful where the questions are.** Answer existing questions about
   few invoices, the KOR and the btw-aangifte on Reddit and Dutch forums, as
   the maker, only where the rules allow it. See "Habitats".
4. **One own post per community**, only after a few weeks of useful replies
   there and only where a showcase is allowed.
5. **Paid: not before** ten conversations, one paying customer, and a page
   that converts visitors from the communities above. Written down here so
   it is not skipped.

Scale in this order: more of what works, then better versions of it, then a
new channel.

## Listings

Prepared in `docs/DIRECTORIES.md`; each needs the owner's own login.

| Listing | Ready | Owner step |
| --- | --- | --- |
| Official MCP Registry | `server.json` validated on 19 November 2026 | `mcp-publisher login github`, then `mcp-publisher publish` |
| Glama, PulseMCP | Follow the registry automatically | None |
| Claude Connectors Directory | Texts in `docs/DIRECTORIES.md` | Submit at claude.ai/directory/manage (paid Claude plan); the phone test is done |
| mcpservers.org | Free form | Submit at mcpservers.org/submit |
| awesome-remote-mcp-servers | Pull request | After the Glama listing |
| ChatGPT Directory | Blocked | Needs a review login without e-mail codes; decide later |

## Measurement

Baseline on 19 November 2026: GitHub 3 views from 2 visitors in 14 days,
0 stars; Web Analytics switched on that day, no data yet.

| Goal (owner) | Where to read it |
| --- | --- |
| Conversations | The log below; one line per conversation |
| Cloud trials | The operator e-mail "Nieuw Bookiz Cloud-account"; for totals `bookiz_cloud.account`, `created_at` (Supabase SQL editor) |
| Done for you presale | Stripe, and the operator e-mail Bookiz sends on payment |
| Self-host users | GitHub traffic and stars (`gh api repos/meestierolff/bookiz/traffic/views`) |
| Where visitors come from | Vercel Web Analytics, by referrer (reddit.com, tweakers.net) and landing page. Whether UTM breakdowns are in this plan is UNVERIFIED; links in posts carry `?utm_source=<community>` anyway |

## Habitats

Read on 19 November 2026 from each community's own rules. A community whose
rules could not be read is marked "rules unknown — do not use".

### Dutch forums: answer, never name

Neither forum allows naming your own product in a post, and neither has an
exception for disclosing that you are the maker. In practice moderators
remove brand names and links (Higherlevel, 2026), and Tweakers closed a
maker's topic the same evening with "GoT is geen marketingkanaal". On these
forums Bookiz earns trust only through the owner's own useful answers; the
name stays out.

Tweakers also forbids largely generated text (house rule 3). Agents may
supply checked facts and sources for an answer, never text to paste.

| Forum | Fit | Rule on self-promotion (source) | What the owner may do |
| --- | --- | --- | --- |
| Higherlevel: [Administratie](https://www.higherlevel.nl/forums/forum/21-administratie-en-verzekeringen/), [Fiscale zaken](https://www.higherlevel.nl/forums/forum/40-fiscale-zaken/) | High: eenmanszaak btw and booking questions | "Je kunt hier dus geen reclame maken, je diensten aanbieden in berichten (zelfpromotie) of op zoek naar klanten (acquisitie)." Only the profile may advertise ([forumregels](https://www.higherlevel.nl/forumregels/)) | Answer btw, KOR and booking questions with the Belastingdienst source. After a track record, a signature link (max 1000 characters, "voorbehouden aan actieve deelnemers") and a profile that mentions Bookiz |
| Higherlevel: [ICT](https://www.higherlevel.nl/forums/forum/16-ict-automatisering-en-internet/), [AI-verzameltopic](https://www.higherlevel.nl/forums/topic/78722-verzameltopic-voor-ai-oplossingen-die-nog-een-probleem-en-een-doelgroep-zoeken/) | Medium-high: AI-curious, choosing software | Maker topics are moved to the AI collection topic and checked "met speciale aandacht"; asking for feedback counts as unwanted market research; brand names, links and prices removed (Sep, Oct 2026) | Practical answers about AI in an administration (the assistant proposes, a person approves). No name |
| Tweakers: [Persoonlijke financiën, studie en loopbaan](https://gathering.tweakers.net/forum/list_topics/25), incl. the [freelance topic](https://gathering.tweakers.net/forum/list_messages/1407014) | Medium: mostly employees, ICT freelancers | House rule 6: "Berichten plaatsen met reclame of promotie als doel is niet toegestaan, tenzij er in een bepaald forum een uitzondering geldt. Neem bij twijfel contact op met de crew voordat je post." ([huisregels](https://tweakers.net/info/algemene-voorwaarden/huisregels/)) | Own-words answers on btw and KOR mechanics. A link to a personal site is allowed in the signature or profile |
| Tweakers: [AI algemeen](https://gathering.tweakers.net/forum/list_topics/127) | Medium-high for Claude and MCP | [AI-beleid](https://gathering.tweakers.net/forum/list_messages/2336664): "Geen showcases van je AI-gegenereerde project", "Geen werving van testers voor je AI-project" | Share what was learned building an MCP server for money matters (human sign-off before anything final). No name |
| Tweakers: Softwareontwikkeling, Serversoftware en clouddiensten | Medium: the self-host audience | **Rules unknown — do not use.** House rule 6 allows exceptions per section | First ask the crew by message whether an open-source project may be shown there |

Threads worth an answer (no product name; the owner judges whether there is
still something to add):

- [HL 78620](https://www.higherlevel.nl/forums/topic/78620-hoe-richten-jullie-je-administratie-facturatieuren-in-als-freelancer/) "Hoe richten jullie je administratie in als freelancer?", Aug 2026.
- [HL 78701](https://www.higherlevel.nl/forums/topic/78701-gratis-administratieprogramma-pap/) "Gratis administratieprogramma", Sep to Nov 2026.
- [HL 78262](https://www.higherlevel.nl/forums/topic/78262-wat-voor-boekhoudsoftware-gebruiken-jullie-nu-internationale-klantbasis/) "Wat voor boekhoudsoftware gebruiken jullie nu?", Feb 2026.
- [HL 78651](https://www.higherlevel.nl/forums/topic/78651-automatiseren-met-ai-en-waar-het-volgens-mij-misgaat/) "Automatiseren met AI, en waar het volgens mij misgaat", Aug to Nov 2026.
- [Tweakers 2348702](https://gathering.tweakers.net/forum/list_messages/2348702) "Welke MCP's gebruiken jullie?", Oct 2026: the opening post does eenmanszaak bookkeeping with Claude coupled to another package.

Not usable: administratieforum.nl, zzp-forum.nl (tied to a competitor),
freelance.nl (no member forum found), Viva (commercial use needs written
permission), Dutch AI Discord or Slack groups (none publicly documented).

### Reddit: answer by hand, name it only in the promo threads

Rules read from each subreddit's sidebar on 19 November 2026 (logged out;
the separate rules pages require a login). Visitor numbers are Reddit's
"weekly visitors".

| Subreddit | Fit | Rule on self-promotion (quoted) | Where Bookiz may be named |
| --- | --- | --- | --- |
| r/ondernemen, 21K | High: zzp, Moneybird and Jortt questions | R2: "Er is een gepinde post … waar je eenmalig een berichtje mag plaatsen over je diensten. Daarbuiten is dit niet toegestaan." R3 bans market research outside it; R5 bans "stuur me een pb" | Once, in the pinned "Promo draadje" (`/r/ondernemen/comments/18kpe8o/`) |
| r/ZZPNederland, 5.8K | High | "Geen werving/reclame zonder goedkeuring van een mod." | In the megathread (`/r/ZZPNederland/comments/1u8yice/`, template asks "Gratis of betaald?"), after a mod says yes |
| r/FreelanceNL, 10K | High | R3: self-promotion only if "waardevol en relevant … transparant en in bescheiden vorm". R7: "Geen tools/apps aanbieden … Overleg eerst met de moderators." | In the megathread (`/r/FreelanceNL/comments/1u8yh26/`), after a mod says yes |
| r/belasting, 32K | High for btw and KOR | Only "Hou het netjes" | Answers. Naming: not forbidden, but disclose being the maker and only where it answers the question |
| r/geldzaken, 107K | Medium | R3: self-promotion "vooraf met de mods afgestemd". R9: no "AI-gegenereerde content" | Nowhere: its promo thread requires "volledig gratis … geen 'gratis proefperiode'". Hand-written answers only |
| r/werkzaken, 132K | Medium | R3: "(zelf)promotie … toestemming nodig van een mod" | After a mod says yes. Two of its threads rank in Google for "moneybird alternatief" and "boekhoudprogramma zzp ervaringen" |
| r/mcp, 48K | Medium: builders | R3: "Self-promotion is allowed with proper disclosure." R1: no waitlists. R2: AI slop leads to a ban | A disclosed post with `showcase` flair; better a discussion about trust and permissions. Never mention the Done for you presale (waitlist rule) |
| r/ClaudeAI, 2.1M | Medium: Claude users, few Dutch | R7: "built with Claude… BY YOU", explain "how Claude helped in detail", "free to try and say so (paid tiers OK)", "OP karma>100" | One "Built with Claude" post, once the account has more than 100 karma |
| r/selfhosted, 515K | Low-medium | R2: "Promoted apps must be production ready and have docs." R6: projects under 3 months only in the New Project Megathread | Megathread only, and not before Bookiz is past 0.1. The repo started on 16 November 2026 |

Not usable: r/zzp (banned), r/belastingdienst (no rules shown), r/thenetherlands
and r/freelance (ban self-promotion), r/DutchFIRE (low fit, bans generated
replies), r/Netherlands (English, low fit), r/ClaudeCode (low fit).

Threads worth an answer, without naming Bookiz unless the table allows it:

| Date | Thread | The question |
| --- | --- | --- |
| 2026-07-14 | `/r/ondernemen/comments/1uw1va4/` | Small zzp next to a job; resents paying for software for "af en toe een factuur" |
| 2026-10-28 | `/r/ondernemen/comments/1xhvtyq/` | Considering Jortt; uses ChatGPT, "best bereid Claude te nemen" |
| 2026-04-05 | `/r/FreelanceNL/comments/1scynl3/` | Leaving the KOR, quarterly btw, a fixed monthly invoice |
| 2026-11-11 | `/r/FreelanceNL/comments/1xth2qr/` | First year, does taxes "with the help of ChatGPT and Claude" |
| 2026-03-14 | `/r/FreelanceNL/comments/1rth1iw/` | Consultant with "1–2 invoices per month" |
| 2026-04-29 | `/r/ZZPNederland/comments/1szdl1v/` | Starter wants the tax return "nagenoeg direct" from the app |
| 2026-05-12 | `/r/geldzaken/comments/1tb3bph/` | Student with a side job: KOR or not (hand-written answer only) |

Objections seen, to answer honestly rather than avoid:

- "Nummer 57 die een nieuwe boekhoud-app heeft gemaakt?" (`/r/ZZPNederland/comments/1v6e9sr/`)
- "Als iets gratis is, ben jij het product." (`/r/ZZPNederland/comments/1r306jo/`). Answer: the code is open, the paid Cloud is the business model, receipts are not stored by Bookiz.
- "AI is really bad at maths, and this is one area where you do not want hallucinations." (`/r/selfhosted/comments/1u12ucp/`). Answer: the AI does no sums; a fixed engine does, under rules with their source.
- A commenter recommends Moneybird with Claude over MCP, "Werkt als een trein" (`/r/ondernemen/comments/1xhvtyq/`; the poster's claim, UNVERIFIED).

### What they say, in their words

- The administration is small: "simpel, weinig administratie en af en toe een
  factuur", "Voor iemand met een minimale administratie is dit niet te
  rechtvaardigen" (`/r/ondernemen/comments/1uw1va4/`), "die paar factuurtjes"
  (`/r/ondernemen/comments/1w5kgbi/`).
- It runs next to a job: "Ik zzp er een beetje bij naast een fulltime job.
  Soms elke maand iets, soms langere tijd niets." (`/r/ondernemen/comments/1uw1va4/`)
- AI is already in the routine: "Kun je voor die paar factuurtjes niet een
  boekhouding in Excel bijhouden al dan niet via Claude?"
  (`/r/ondernemen/comments/1w5kgbi/`)

- Low volume and a few hours, not features: "Een zondagmorgen voor de
  kwartaalaangifte BTW is voldoende." Software is "óf veel te
  ingewikkeld/duur … óf dat data niet fijn lokaal/privacyvriendelijk te
  beheren is" ([HL 78620](https://www.higherlevel.nl/forums/topic/78620-hoe-richten-jullie-je-administratie-facturatieuren-in-als-freelancer/)).
- AI takes the quarterly chore away: "Dit was altijd een rotwerkje, maar ging
  nu vanzelf." ([Tweakers 2348702](https://gathering.tweakers.net/forum/list_messages/2348702)).
- Trust comes from seeing why: "Als de gebruiker kan zien waarom een factuur
  in een bepaalde rubriek terechtkomt, dan voelt het systeem waarschijnlijk
  betrouwbaarder." ([HL 78433](https://www.higherlevel.nl/forums/topic/78433-wat-vinden-jullie-van-mijn-webapp-omtrent-btw-aangifte-voor-buitenlanders/)),
  and fear of stale rules: "geen updates betekent risico op verouderde
  btw-regels" ([HL 78701](https://www.higherlevel.nl/forums/topic/78701-gratis-administratieprogramma-pap/)).

These three are exactly what Bookiz is built around (few invoices; the
assistant does the chore; every rule with its source, checked nightly). Use
them as the wording of the site and of posts where naming is allowed.

### Competition in the same channel

Jortt publishes "Hoe kan ChatGPT in mijn boekhouding kijken? Via MCP." and
the Tweakers poster above couples Claude to an existing package. Connecting
an assistant to bookkeeping is not unique; what is: built for few invoices,
the rules as checkable data, open source, and a price for that size.

## The first two weeks

About three hours a week (owner, 19 November 2026).

| When | Owner step | Why |
| --- | --- | --- |
| Week 1 | ~~Phone test~~ done on 21 November 2026 | "Werkt met Claude" may be used |
| Week 1 | ~~Onboarding from the landing page~~ live on 21 November 2026 (PR #31, #32) | "Start gratis" leads to sign-in, business details, switching, connecting |
| Week 1 | Draft 4 in the r/ondernemen promo thread (once), now | The one place that allows it without asking; the flow it describes is live |
| Week 1 | Run one month of bank CSV through Claude | Proof for the bank claim, and the answer to the first question people will ask |
| Week 1 | Claude Code test: one `finalize_invoice` against a throwaway data folder | Unlocks the self-host call to action and the r/mcp post |
| Week 1 | MCP Registry publish; mcpservers.org form | Listings that work without an audience |
| Week 1 | Send drafts 1, 2 and 3 (ask the mods and the Tweakers crew) | The megathreads and Tweakers need a yes first |
| Week 1 | Three hand-written answers from the thread lists, without the name | Karma, a history, and the language of the customer |
| Week 2 | Drafts 4 adapted for the megathreads where a mod said yes | |
| Week 2 | Claude Connectors Directory submission | Ready to submit |
| Week 2 | Draft 6 on r/mcp | After the Claude Code test |
| End of week 2 | Fill the log; read referrers, sign-ups, Stripe, GitHub | Decide: more of what brought a visit, sign-up or conversation |

Conversations cannot be asked for in threads (market research is banned on
r/ondernemen outside its megathread and on Higherlevel). They come from
people who start a Cloud trial: the owner writes to each one personally,
to help them get started (support, not advertising: the privacy statement
promises no advertising without consent). Bookiz e-mails the operator when
a new Cloud account is created (decided 19 November 2026).

## Drafts

Each draft names the value it offers, when it may go out and the approver
(Mees). None is posted. Where a community bans generated text, the draft is
only material: the owner writes the post in his own words.

### 1. Message to the r/FreelanceNL moderators

Value: transparency before anything is posted. When: now. Approver: Mees.

> Hoi, ik ben Mees en ik maak Bookiz: open-source boekhouding voor
> eenmanszaken met weinig facturen, die je bedient via je eigen AI-assistent.
> Regel 3 staat bescheiden zelfpromotie toe, regel 7 vraagt eerst te overleggen
> over tools. Mag ik één bericht in de megathread zetten? Ik zeg erbij dat ik de
> maker ben, dat het nog vroeg is (versie 0.1) en wat het kost: zelf hosten is
> gratis, de gehoste versie kost € 99 per jaar na 30 dagen gratis. Liever niet?
> Dan beantwoord ik alleen vragen, zonder het te noemen.

### 2. Message to the r/ZZPNederland moderators

Value and approver as draft 1. When: now.

> Hoi, ik ben de maker van Bookiz, open-source boekhouding voor eenmanszaken
> met weinig facturen, die je bedient via je eigen AI-assistent. Jullie regels
> vragen goedkeuring voor reclame, dus ik vraag het eerst: mag ik één bericht
> in de megathread plaatsen, volgens het sjabloon daar? Het is nog vroeg
> (versie 0.1) en ik zeg dat ook. Zelf hosten is gratis; de gehoste versie
> kost € 99 per jaar na 30 dagen gratis.

### 3. Message to the Tweakers crew

Value: a clear question instead of a guess. When: now. Approver: Mees. The
owner rewrites it in his own words (house rule 3).

> Material: Bookiz is an AGPL project on GitHub (an MCP server for
> bookkeeping of a Dutch eenmanszaak), with a paid hosted version. House rule
> 6 allows exceptions per forum. Question: may an open-source project like
> this be shown in Softwareontwikkeling or in Serversoftware en clouddiensten,
> and if so where and in what form? If not, it will not be mentioned.

### 4. Promo entry for r/ondernemen (and, adapted, the megathreads)

Value: an honest description the reader can check. When: now (phone test done
21 November 2026, onboarding from the landing page live). Approver: Mees, who
posts it himself and makes it his own words. Links carry
`?utm_source=reddit-<sub>`.

> **Bookiz: boekhouding voor eenmanszaken met weinig facturen.** Ik ben de
> maker.
>
> Voor wie: je stuurt een handvol facturen per maand of minder, bijvoorbeeld
> naast een baan of onder de KOR.
>
> Hoe het werkt: er is geen app om te leren. Je koppelt Bookiz aan Claude en
> zegt wat er gebeurde: "maak een factuur voor Klant BV, tien uur advies à 85
> euro" of "hier is de bon van de lunch". Bookiz maakt de factuur, boekt de bon
> en zet je btw-aangifte per rubriek klaar. Indienen doe je zelf in Mijn
> Belastingdienst Zakelijk.
>
> Waarom je het kunt nalezen: de AI rekent niet. Een vaste rekenmotor past de
> regels toe, en elke regel staat als bestand in de open code, met de zin van
> de Belastingdienst waar hij vandaan komt. Die bronnen worden elke nacht
> gecontroleerd.
>
> Beginnen: op boekiehouder.nl op "Start gratis", inloggen met een code per
> mail, je bedrijfsgegevens één keer invullen en het adres kopiëren naar
> Claude. Daarna gaat alles via Claude.
>
> Eerlijk: het is versie 0.1 en er zijn nog geen klanten. Een bonfoto leest
> Claude uit; het origineel upload je één keer via een link, dan staat het in
> je eigen mailbox. Zelf hosten is gratis; de gehoste versie kost € 99 per jaar
> excl. btw, de eerste 30 dagen gratis, zonder betaalgegevens. Het verdienmodel
> is dat abonnement; je bonnen bewaart Bookiz niet.
>
> boekiehouder.nl/?utm_source=reddit-ondernemen

### 5. Facts for answers about the KOR and the btw-aangifte

Value: correct, sourced answers in threads such as
`/r/FreelanceNL/comments/1scynl3/` and `/r/geldzaken/comments/1tb3bph/`.
When: now. Approver: Mees. Material only; on r/geldzaken the answer must be
written by hand. Quotes from `rules/nl-2026.json`:

- KOR limit: "Per kalenderjaar hebt u een omzet van maximaal € 20.000. De
  maximale omzet van € 20.000 geldt voor het kalenderjaar waarin u zich
  aanmeldt, én voor het kalenderjaar daarvóór."
  ([kor-voorwaarden](https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/kor-voorwaarden)).
  Over the limit you must deregister at once, and the supply that crosses it
  is fully taxed (belastingdienst.nl, afmelden-kor).
- A small mistake in a return: "Hebt u bij uw btw-aangifte een bedrag van
  maximaal €1000 te veel of te weinig ingevuld? Dan geeft u dat bedrag op in
  uw eerstvolgende btw-aangifte."
  ([aangifte corrigeren](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/aangifte_corrigeren/aangifte_corrigeren)).
- Receipts by photo: "U mag facturen en bonnetjes ook scannen en digitaal
  bewaren. Er moet dan wel sprake zijn van een juiste en volledige weergave
  van het origineel." Keep them seven years
  ([facturen bewaren](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/uw_facturen_bewaren)).
- Urencriterium: "U besteedt in het kalenderjaar minimaal 1.225 uren aan uw
  onderneming(en)."
  ([voorwaarden urencriterium](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/inkomstenbelasting_voor_ondernemers/voorwaarden_urencriterium)).

### 6. Discussion post for r/mcp

Value: a pattern other MCP builders can use. When: after the Claude Code
test. Approver: Mees. Material only (r/mcp bans AI slop); disclose being
the maker; no Done for you.

- The problem: an assistant can finalize an invoice, send it or close a btw
  period, and none of that can be undone. An instruction to "ask first"
  depends on the model obeying it.
- What Bookiz does: the server asks the human itself (MCP elicitation) before
  those four steps. The question is built from stored records, not from the
  model's summary, so the human confirms what will actually happen.
- Two lessons: a yes that arrives after the client gave up must not run the
  step (pass the tool call's abort signal along); and on stateless HTTP
  every request is a fresh server that cannot hold a question open, so the
  gate only works over stdio.
- Question to the community: which clients show a form with no fields, and
  how do you gate irreversible tools on stateless servers?

### 7. Answers for questions under the post

Value: short, true answers to what people asked in the threads we read.
When: under the owner's own post in the promo thread. Approver: Mees, in his
own words.

- **"Heeft het een bankkoppeling?"** Nee, bewust niet. Wel: download een
  CSV van je bank en geef die aan Claude. Claude zet ontvangen betalingen bij
  je openstaande facturen en noemt de afschrijvingen waarvoor nog geen bon in
  Bookiz staat. Het btw-bedrag komt altijd van de bon, nooit uit de
  bankregel. (Only after the bank CSV test above; until then: "geen
  bankkoppeling; betalingen meld je aan Claude".)
- **"Kan mijn boekhouder erbij?"** Op Mijn Bookiz download je per jaar een
  Excel met een tab Inkomsten (elke factuurregel) en een tab Uitgaven (elke
  bon), of losse CSV's. De kolommen tellen op tot het jaaroverzicht. Daarnaast
  is er een volledige export met aangiftes, jaaroverzicht en logboek.
- **"Weet het wat aftrekbaar is?"** Of iets zakelijk is, zeg jij. Hoe het
  telt, past Bookiz toe volgens de regels van de Belastingdienst: btw op eten
  en drinken in de horeca is niet aftrekbaar en 80% telt als kosten, onder de
  KOR trek je geen btw af, een buitenlands abonnement is btw verlegd
  (rubriek 4a/4b), en vanaf € 450 excl. btw schrijf je af. Elke regel staat
  met de zin van de Belastingdienst in de open code.
- **"AI en belasting, gaat dat goed?"** De AI rekent niet. Claude leest de
  bon en geeft de feiten door; een vaste rekenmotor past de regels toe, en
  elke bron wordt elke nacht gecontroleerd.

## Decided

- **19 November 2026:** about three hours a week; the operator gets an
  e-mail for every new Cloud account.

## Open decisions

- **Moneybird in replies.** Switching is a core promise, but the import has
  not run on a real Moneybird export. Until it has, replies point to
  boekiehouder.nl/overstappen and promise nothing more.

## Log

| Date | Where | What (link) | Result | Language heard |
| --- | --- | --- | --- | --- |
| | r/ondernemen, Promo draadje | Draft 4 | | |
