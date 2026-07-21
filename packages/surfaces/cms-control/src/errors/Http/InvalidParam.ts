export default class InvalidParam extends Error {
    /** Client error — the runner maps this to a 400 response. */
    status = 400;

    constructor(name: string, message?: string) {
        super("Invalid param " + name + " " + message);
    }
}
