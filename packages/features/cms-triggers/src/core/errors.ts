export class DuplicateTriggerError extends Error {
    constructor(readonly triggerId: string) {
        super(`duplicate trigger: ${triggerId}`);
        this.name = "DuplicateTriggerError";
    }
}
