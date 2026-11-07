/** A business refusal; its admitted binding owns transport status and presentation. */
export class ContentCapabilityError extends Error {
    constructor(readonly code: string) {
        super(code);
    }
}
