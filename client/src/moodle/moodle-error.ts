/** Failure kinds a gateway call can end in. */
export type MoodleErrorKind = 'network' | 'http' | 'session' | 'exception' | 'protocol';

const SESSION_CODES = new Set(['servicerequireslogin', 'invalidsesskey', 'requireloginerror']);

/** Typed failure of a Moodle call. */
export class MoodleError extends Error {
  override readonly name = 'MoodleError';

  constructor(
    readonly kind: MoodleErrorKind,
    message: string,
    readonly errorcode = '',
  ) {
    super(message);
  }

  /** Builds the failure for a Moodle exception payload. */
  static fromException(errorcode: string, message: string): MoodleError {
    return new MoodleError(SESSION_CODES.has(errorcode) ? 'session' : 'exception', message, errorcode);
  }
}
