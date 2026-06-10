/**
 * Thrown when an OpenAPI spec can't be parsed: malformed JSON, missing
 * required keys, or an unsupported version. Caught by the sync flow to
 * surface a clean error to the admin.
 */
export class SpecParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SpecParseError";
    }
}
