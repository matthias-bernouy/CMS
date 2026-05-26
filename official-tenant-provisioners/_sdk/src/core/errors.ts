/**
 * Typed error hierarchy. Each error carries its HTTP status + a problem
 * `type` slug; the error->HTTP mapper turns these into RFC 7807 `application/problem+json`.
 * The slug is opaque here — 06 maps it to a full URI and enforces the
 * opaque-client / precise-logs rule (base.md §6).
 */
export class SdkError extends Error {
    readonly httpStatus:  number;
    readonly problemType: string;

    constructor(message: string, httpStatus = 500, problemType = "internal") {
        super(message);
        this.name = new.target.name;
        this.httpStatus  = httpStatus;
        this.problemType = problemType;
    }
}

/** Invalid `ProviderConfig` / wiring (fail fast at `createProvider`). */
export class ConfigError extends SdkError {
    constructor(message: string) { super(message, 500, "config"); }
}

/** Malformed request body / query (400, actionable for the trusted caller). */
export class ValidationError extends SdkError {
    constructor(message: string) { super(message, 400, "validation"); }
}

/** Any §4.5 verification failure. Detail stays opaque to the client. */
export class AuthError extends SdkError {
    constructor(message = "authentication failed") { super(message, 401, "auth"); }
}

/** §4.7 plane/role mismatch. */
export class PlaneError extends SdkError {
    constructor(message = "forbidden for this plane") { super(message, 403, "plane"); }
}

/** Tenant suspended (§5 / §8). */
export class SuspendedError extends SdkError {
    constructor(message = "tenant suspended") { super(message, 403, "suspended"); }
}

/** Provisioning failure (§8). 409 on idempotency/issuer conflict. */
export class ProvisioningError extends SdkError {
    constructor(message: string, httpStatus = 500) {
        super(message, httpStatus, "provisioning");
    }
}
