import type { DisposableVerificationDatabaseCredential } from "../types";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function validateDisposableDatabaseCredential(
    value: DisposableVerificationDatabaseCredential,
): DisposableVerificationDatabaseCredential {
    if (!value || typeof value !== "object" || !IDENTIFIER.test(value.databaseId)) {
        throw new TypeError("Disposable database identity is invalid");
    }
    if (typeof value.connectionUri !== "string" || value.connectionUri.length > 8_192) {
        throw new TypeError("Disposable database connection URI is invalid");
    }
    let url: URL;
    try {
        url = new URL(value.connectionUri);
    } catch {
        throw new TypeError("Disposable database connection URI is invalid");
    }
    if (
        (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
        !url.hostname ||
        !url.username ||
        !url.password ||
        decodeURIComponent(url.password).length < 12 ||
        url.hash
    ) {
        throw new TypeError("Disposable database connection URI must carry an ephemeral PostgreSQL credential");
    }
    return Object.freeze({ databaseId: value.databaseId, connectionUri: value.connectionUri });
}
