export class EventsError extends Error {
    constructor(readonly code: string) {
        super("The event request was refused.");
    }
}
