export class InvalidIdentityError extends TypeError {
    constructor(message: string) {
        super(message);
        Object.defineProperty(this, "name", { value: "InvalidIdentityError", configurable: true });
    }
}

export class IdentityAliasConflictError extends Error {
    constructor() {
        super("Identity alias conflicts with an existing binding");
        Object.defineProperty(this, "name", { value: "IdentityAliasConflictError", configurable: true });
    }
}
