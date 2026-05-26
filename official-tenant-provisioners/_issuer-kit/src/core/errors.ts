/** Issuer-kit error base. */
export class IssuerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/** Key material missing / unreadable / KEK unavailable (fail fast). */
export class KeyStoreError extends IssuerError {}
