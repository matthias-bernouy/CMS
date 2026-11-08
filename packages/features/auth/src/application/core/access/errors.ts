/** Business refusal code; the admitted binding owns HTTP status and presentation. */
export class AccessError extends Error {
    constructor(readonly code: string) {
        super(code);
    }
}
