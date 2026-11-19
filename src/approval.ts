import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { BookizError } from './errors.ts';

/**
 * Who said yes to a step that cannot be taken back or leaves the building.
 * `owner`: the owner confirmed in a dialog Bookiz put up through the client.
 * `assistant`: the client cannot show such a dialog, so Bookiz relied on the
 * assistant having asked in the conversation, as its instructions say.
 */
export type Approval = 'owner' | 'assistant';

/** Reading a draft takes longer than the SDK's default wait of one minute. */
const WAIT_MS = 10 * 60 * 1000;

/**
 * Put the question to the owner directly, past the assistant, when the client
 * can show a form (MCP elicitation). Anything but an explicit yes stops the
 * step. Over stateless HTTP each request gets a fresh server that never saw the
 * client's capabilities, so there it always falls back to the assistant.
 *
 * `call` is the tool call being confirmed. A client may give up on it before
 * the owner answers; a yes that arrives after that must not run the step, since
 * nobody would see the result.
 */
export async function askOwner(server: Server, question: string, call: { signal: AbortSignal; requestId: string | number }): Promise<Approval> {
  if (!server.getClientCapabilities()?.elicitation?.form) return 'assistant';
  const expired = new BookizError(
    'Bookiz kon je niet om bevestiging vragen, of je antwoord bleef uit; er is niets gewijzigd.',
    'Probeer het opnieuw zodra de eigenaar kan bevestigen.',
  );
  let action: string;
  try {
    ({ action } = await server.elicitInput(
      { mode: 'form', message: question, requestedSchema: { type: 'object', properties: {} } },
      { timeout: WAIT_MS, signal: call.signal, relatedRequestId: call.requestId },
    ));
  } catch (error) {
    console.error('[bookiz] asking the owner failed', error);
    throw expired;
  }
  if (call.signal.aborted) throw expired;
  if (action !== 'accept') {
    throw new BookizError('Je hebt dit niet bevestigd; er is niets gewijzigd.', 'Vraag wat er anders moet en probeer het daarna opnieuw.');
  }
  return 'owner';
}
