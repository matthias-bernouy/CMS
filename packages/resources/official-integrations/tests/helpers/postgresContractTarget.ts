export const POSTGRES_CONTRACT_RESET_CONFIRMATION = "cmscore-postgres-contracts";

export function requireDisposablePostgresContractTarget(source: Record<string, string | undefined>): string {
    if (source.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET !== POSTGRES_CONTRACT_RESET_CONFIRMATION) {
        throw new Error(`ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET must equal "${POSTGRES_CONTRACT_RESET_CONFIRMATION}".`);
    }
    const value = source.DATABASE_URL?.trim();
    if (!value) {
        throw new Error("DATABASE_URL is required and must target a disposable PostgreSQL database.");
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
    }
    if (!isLoopback(parsed.hostname)) {
        throw new Error("PostgreSQL contracts may run only against a loopback database host.");
    }
    const database = decodeURIComponent(parsed.pathname.slice(1));
    if (!/^cmscore_contracts(?:_[a-z0-9][a-z0-9_-]*)?$/.test(database)) {
        throw new Error('The disposable database name must be "cmscore_contracts" or use that prefix.');
    }
    return value;
}

function isLoopback(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
