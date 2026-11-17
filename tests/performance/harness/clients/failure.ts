/** Only test-owned diagnostic identifiers are retained; never carry a remote message or payload. */
export class ClientFailure extends Error {
    constructor(readonly code: string) {
        super(code);
    }
}
