/**
 * An error the user (or their agent) can act on. The message is Dutch because
 * it ends up in a Dutch conversation; `hint` says what to do next.
 */
export class BookizError extends Error {
  hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'BookizError';
    this.hint = hint;
  }
}
