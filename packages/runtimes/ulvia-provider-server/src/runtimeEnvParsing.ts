export type RuntimeEnvSource = Record<string, string | undefined>;

export function requiredEnv(source: RuntimeEnvSource, name: string): string {
    const value = source[name]?.trim();
    if (!value) {
        throw new Error(`env ${name} missing`);
    }
    return value;
}

export function parsePort(raw: string | undefined, name: string, fallback: number): number {
    if (raw === undefined) {
        return fallback;
    }
    if (!/^\d+$/.test(raw)) {
        throw new Error(`${name} must be an integer port`);
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be between 1 and 65535`);
    }
    return port;
}

export function parseHttpUrl(raw: string, name: string): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error(`${name} must be a valid URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`${name} must use http:// or https://`);
    }
    return url.href.replace(/\/$/, "");
}

export function parseBoolean(raw: string | undefined, name: string, fallback: boolean): boolean {
    if (raw === undefined) {
        return fallback;
    }
    if (raw === "true") {
        return true;
    }
    if (raw === "false") {
        return false;
    }
    throw new Error(`${name} must be true or false`);
}
