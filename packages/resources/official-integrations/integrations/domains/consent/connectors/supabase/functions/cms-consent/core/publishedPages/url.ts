import { HttpError } from "../errors.ts";

const snapshotRoute = "/.cms/content/published-page-snapshot";

type EnvironmentReader = (name: string) => string | undefined;

export function pageIdFromSnapshotUrl(value: string): string {
    try {
        const url = new URL(value);
        const id = url.searchParams.get("id") ?? "";
        if (
            !isAllowedOrigin(url) ||
            url.username ||
            url.password ||
            url.hash ||
            !url.pathname.endsWith(snapshotRoute) ||
            [...url.searchParams.keys()].some((key) => key !== "id") ||
            url.searchParams.getAll("id").length !== 1 ||
            !id.trim() ||
            id.length > 512
        ) {
            invalidUrl();
        }
        return id;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        invalidUrl();
    }
}

function invalidUrl(): never {
    throw new HttpError(422, "consent document URL is not a trusted published snapshot");
}

function isAllowedOrigin(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    if (url.protocol === "http:") {
        return isLocalDevelopmentHost(hostname) && isLocalSupabaseRuntime();
    }
    return url.protocol === "https:" && !isBlockedHttpsHost(hostname);
}

export function localSnapshotFetchUrl(value: string, readEnv: EnvironmentReader = readEnvironment): string {
    if (readEnv("ULVIA_LOCAL_PROVIDER_SIMULATION") !== "v1") {
        return value;
    }
    try {
        const supabaseUrl = new URL(readEnv("SUPABASE_URL") ?? "");
        const snapshotUrl = new URL(value);
        if (
            supabaseUrl.protocol === "http:" &&
            supabaseUrl.hostname.toLowerCase() === "kong" &&
            snapshotUrl.protocol === "http:" &&
            isLocalDevelopmentHost(snapshotUrl.hostname.toLowerCase())
        ) {
            snapshotUrl.hostname = "host.docker.internal";
            return snapshotUrl.toString();
        }
    } catch {
        return value;
    }
    return value;
}

function isBlockedHttpsHost(hostname: string): boolean {
    if (
        isLocalDevelopmentHost(hostname) ||
        hostname.endsWith(".local") ||
        hostname === "metadata.google.internal" ||
        hostname.includes(":")
    ) {
        return true;
    }
    const octets = hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    const [first, second, third] = octets as [number, number, number, number];
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && (second === 168 || (second === 0 && (third === 0 || third === 2)))) ||
        (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
        (first === 203 && second === 0 && third === 113) ||
        first >= 224
    );
}

function isLocalDevelopmentHost(hostname: string): boolean {
    return (
        hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
    );
}

function isLocalSupabaseRuntime(): boolean {
    try {
        const url = new URL(readEnvironment("SUPABASE_URL") ?? "");
        const hostname = url.hostname.toLowerCase();
        return (
            url.protocol === "http:" &&
            (isLocalDevelopmentHost(hostname) ||
                (hostname === "kong" && readEnvironment("ULVIA_LOCAL_PROVIDER_SIMULATION") === "v1"))
        );
    } catch {
        return false;
    }
}

function readEnvironment(name: string): string | undefined {
    try {
        return Deno.env.get(name);
    } catch {
        return undefined;
    }
}
