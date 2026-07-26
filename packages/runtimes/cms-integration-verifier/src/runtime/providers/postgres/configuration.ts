import { readIntegrationVerifierKey } from "../../../config";

const HOST = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/u;
const ADMIN_DATABASE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;
const ROLE = /^cmsv_[a-f0-9]{24}$/u;
const DATABASE = /^cmscore_contracts_[a-f0-9]{24}$/u;

export type PostgresProviderConfig = Readonly<{
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    statementTimeoutMs: number;
}>;

export async function readPostgresProviderConfig(
    source: Record<string, string | undefined>,
): Promise<PostgresProviderConfig> {
    const host = source.CMS_INTEGRATION_VERIFIER_POSTGRES_HOST?.trim();
    const user = source.CMS_INTEGRATION_VERIFIER_POSTGRES_USER?.trim() ?? "postgres";
    const database = source.CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE?.trim() ?? "postgres";
    const passwordFile = source.CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE?.trim();
    if (!host || !HOST.test(host) || !HOST.test(user) || !HOST.test(database) || !passwordFile?.startsWith("/")) {
        throw new Error("Disposable PostgreSQL provider configuration is invalid");
    }
    const password = (await readIntegrationVerifierKey(passwordFile, "PostgreSQL password")).trim();
    if (password.length < 24 || /\s/u.test(password)) {
        throw new Error("Disposable PostgreSQL provider password must be a strong single-line secret");
    }
    return Object.freeze({
        host,
        user,
        database,
        password,
        port: integer(source.CMS_INTEGRATION_VERIFIER_POSTGRES_PORT, 5_432, 1, 65_535),
        statementTimeoutMs: integer(
            source.CMS_INTEGRATION_VERIFIER_POSTGRES_STATEMENT_TIMEOUT_MS,
            120_000,
            1_000,
            600_000,
        ),
    });
}

export function adminUri(config: PostgresProviderConfig): string {
    return databaseUri(config, config.database, config.user, config.password);
}

export function databaseUri(config: PostgresProviderConfig, database: string, user: string, password: string): string {
    const url = new URL("postgresql://invalid/");
    url.hostname = config.host;
    url.port = String(config.port);
    url.username = user;
    url.password = password;
    url.pathname = `/${database}`;
    url.searchParams.set("sslmode", "disable");
    url.searchParams.set("application_name", "cms-integration-verifier");
    return url.toString();
}

export function postgresIdentifier(value: string): string {
    if (!ROLE.test(value) && !DATABASE.test(value)) {
        throw new TypeError("Unsafe disposable PostgreSQL identifier");
    }
    return `"${value}"`;
}

export function postgresAdministrativeDatabaseIdentifier(value: string): string {
    if (!ADMIN_DATABASE.test(value)) {
        throw new TypeError("Unsafe administrative PostgreSQL database identifier");
    }
    return `"${value}"`;
}

export function isDisposablePostgresRole(value: string): boolean {
    return ROLE.test(value);
}

export function isDisposablePostgresDatabase(value: string): boolean {
    return DATABASE.test(value);
}

export function postgresLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function integer(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
    const value = raw === undefined ? fallback : Number(raw);
    if (
        !Number.isSafeInteger(value) ||
        String(value) !== String(raw ?? fallback) ||
        value < minimum ||
        value > maximum
    ) {
        throw new Error("Disposable PostgreSQL numeric configuration is invalid");
    }
    return value;
}
