/**
 * An error that carries an HTTP status. The runner serializes it to a
 * `{ error: message }` response with that status (instead of a generic 500),
 * so the message is meant to be user-facing and explicit.
 */
export default class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}
