export function envText(name: string): string {
    const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
    return deno?.env?.get?.(name)?.trim() ?? "";
}

export function envDefault(name: string, fallback: string): string {
    return envText(name) || fallback;
}

export function requiredEnv(name: string): string {
    const value = envText(name);
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

export function localProviderSimulationEnabled(readEnv: (name: string) => string = envText): boolean {
    return (
        readEnv("ULVIA_LOCAL_PROVIDER_SIMULATION") === "v1" &&
        localSupabaseRuntime(readEnv("SUPABASE_URL")) &&
        readEnv("MONDIAL_RELAY_CONNECT_LOGIN").startsWith("local-") &&
        readEnv("MONDIAL_RELAY_CONNECT_PASSWORD").startsWith("local-") &&
        readEnv("MONDIAL_RELAY_CONNECT_CUSTOMER_ID").startsWith("local-")
    );
}

function localSupabaseRuntime(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            url.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]", "kong", "host.docker.internal"].includes(url.hostname.toLowerCase())
        );
    } catch {
        return false;
    }
}

export function printableAscii(value: string): boolean {
    return /^[\x20-\x7E]*$/.test(value);
}
