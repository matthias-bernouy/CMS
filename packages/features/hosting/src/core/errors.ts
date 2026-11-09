export class HostingError extends Error {
    constructor(
        readonly code: "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "DOMAIN_UNVERIFIED",
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "HostingError";
    }
}
