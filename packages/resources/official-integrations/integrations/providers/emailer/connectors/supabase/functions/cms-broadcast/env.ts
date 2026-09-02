import { HttpError } from "./types.ts";

export function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_BROADCAST_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

export function serviceRoleKey(): string {
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        try {
            const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
            const first = parsed.default ?? Object.values(parsed).find((value) => typeof value === "string" && value);
            if (typeof first === "string" && first) {
                return first;
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function upstreamBase(functionName: string): string {
    return `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/${functionName}`;
}

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new HttpError(500, `missing ${name}`);
    }
    return value;
}

export function optionalIntEnv(name: string, fallback: number): number {
    const value = Deno.env.get(name);
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let result = 0;
    for (let i = 0; i < left.length; i++) {
        result |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return result === 0;
}
