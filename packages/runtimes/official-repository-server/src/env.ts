import { isIP } from "node:net";
import { isAbsolute } from "node:path";

export type OfficialRepositoryEnv = Readonly<{
    host: string;
    port: number;
    publicUrl: string;
    root: string;
    seedRoot?: string;
    shutdownTimeoutMs: number;
}>;

export function readOfficialRepositoryEnv(source: Record<string, string | undefined>): OfficialRepositoryEnv {
    const root = required(source, "ULVIA_REPOSITORY_DIR");
    if (!isAbsolute(root)) {
        throw new Error("ULVIA_REPOSITORY_DIR must be an absolute path");
    }
    const host = source.REPOSITORY_HOST?.trim() || "0.0.0.0";
    if (!validHost(host)) {
        throw new Error("REPOSITORY_HOST must be a hostname or IP address without a scheme or port");
    }
    const seedRoot = source.ULVIA_REPOSITORY_SEED_DIR?.trim();
    if (seedRoot && !isAbsolute(seedRoot)) {
        throw new Error("ULVIA_REPOSITORY_SEED_DIR must be an absolute path");
    }
    const port = integer(source.REPOSITORY_PORT, "REPOSITORY_PORT", 3000, 1, 65_535);
    return {
        host,
        port,
        publicUrl: publicOrigin(source.REPOSITORY_PUBLIC_URL ?? `http://127.0.0.1:${port}`),
        root,
        ...(seedRoot ? { seedRoot } : {}),
        shutdownTimeoutMs: integer(
            source.REPOSITORY_SHUTDOWN_TIMEOUT_MS,
            "REPOSITORY_SHUTDOWN_TIMEOUT_MS",
            10_000,
            0,
            60_000,
        ),
    };
}

function publicOrigin(value: string): string {
    const url = new URL(value);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    ) {
        throw new Error("REPOSITORY_PUBLIC_URL must be an HTTPS origin or a loopback HTTP origin");
    }
    return url.origin;
}

function required(source: Record<string, string | undefined>, name: string): string {
    const value = source[name]?.trim();
    if (!value) {
        throw new Error(`env ${name} missing`);
    }
    return value;
}

function integer(raw: string | undefined, name: string, fallback: number, minimum: number, maximum: number): number {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^\d+$/u.test(raw)) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function validHost(value: string): boolean {
    return (
        value === "localhost" ||
        isIP(value) > 0 ||
        (!/^\d+(?:\.\d+){3}$/u.test(value) && /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(value))
    );
}
