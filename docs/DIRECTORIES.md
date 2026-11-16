# Getting Bookiz listed where assistants find connectors

Status on 16 November 2026. Requirements were read from each vendor's own
pages on that date; they change often, so re-read before submitting.

## What works today without any listing

Anyone can add Bookiz by address: `https://boekiehouder.nl/mcp`. The server
answers with the standard OAuth challenge, the assistant registers itself and
the owner signs in and consents.

| Assistant | Add by address | Limits |
| --- | --- | --- |
| Claude (web, desktop, mobile) | Yes, as a custom connector | Free plan: one custom connector |
| Claude Code | `claude mcp add --transport http bookiz https://boekiehouder.nl/mcp`, or the plugin below | |
| ChatGPT | Business, Enterprise and Edu, on the web | Pro: read-only. Plus: not documented. Not on mobile. A directory listing lifts this |
| Grok | grok.com/connectors, New Connector, Custom | Paid plans; no public submission route found |
| Codex, Cursor, VS Code, Gemini CLI, Mistral, Copilot Studio | Yes, as a remote MCP server with OAuth | Not tested by us |

Only the MCP SDK client has been tested against the live server
(`scripts/cloud-e2e.mjs`). None of the apps above has.

## In this repository

- **Claude Code plugin.** `.claude-plugin/marketplace.json` and `plugin/`.
  Users run `/plugin marketplace add meestierolff/bookiz` and then
  `/plugin install bookiz@bookiz`. Not validated with `claude plugin validate`.
- **MCP registry manifest.** `server.json`, for `io.github.meestierolff/bookiz`.

## Submissions the owner has to make

Each needs an account or a login that only the owner has.

### 1. Official MCP Registry (do this first)

Glama syncs from it hourly and PulseMCP reads from it.

```bash
brew install mcp-publisher
mcp-publisher validate
mcp-publisher login github      # opens a GitHub device login
mcp-publisher publish
```

### 2. Claude Connectors Directory

Portal: https://claude.ai/directory/manage, "Submit new", "MCP connector".
Needs a paid Claude plan. Community listings are scanned automatically.

- Name: `Bookiz`
- One-liner: `Boekhouding voor zzp'ers met weinig facturen: facturen, bonnen en btw-aangifte vanuit Claude.`
- Categories: finance, productivity
- Privacy policy: https://boekiehouder.nl/privacy/
- Documentation: https://github.com/meestierolff/bookiz#readme
- Support: the address in the site footer
- Example prompts:
  1. "Maak een factuur voor Klant BV: tien uur advies à 85 euro."
  2. "Hier is de bon van mijn lunch met een klant, ik heb hem zelf voorgeschoten."
  3. "Hoe sta ik ervoor, en wat moet ik dit kwartaal aan btw betalen?"

Open points for this review:
- Anthropic's policy names finance among high-risk use cases. Bookiz moves no
  money and files nothing, but whether bookkeeping falls under it is unknown.
- Supabase does not advertise Client ID Metadata Documents, so Claude registers
  a new client per connection. Anthropic prefers CIMD for busy servers.

### 3. ChatGPT Directory

Portal: https://platform.openai.com/plugins. Heavier than the others:

- A verified individual or business identity, and a project with global (not
  EU) data residency.
- A challenge token served at `/.well-known/openai-apps-challenge`.
- Five positive and three negative test cases, a video walkthrough.
- **A reviewer account that works without e-mail codes.** Bookiz signs in by
  e-mail code only, so this needs a decision: a password login for one review
  account, or another arrangement with OpenAI.
- Plugins may not show subscription plans or link to a checkout. The message
  Bookiz gives when a trial has ended points to the dashboard; check it
  against this rule before submitting.

### 4. Community lists

- Glama: automatic after the registry.
- mcpservers.org: free form at https://mcpservers.org/submit, review within two weeks.
- `punkpeye/awesome-remote-mcp-servers`: pull request, after the Glama listing.
- mcp.so: paid listing ($39) is the only route stated.

## Before posting publicly that it "works with" an assistant

Connect that assistant to the live server once and book one receipt from a
phone. Until then, say "works with assistants that support remote MCP servers".
