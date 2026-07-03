import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";

export function serviceRoleKey(): string {
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        if (!secretKeys.trim().startsWith("{")) {
            const key = secretKeys.split(",").map(value => value.trim()).find(Boolean);
            if (key) return key;
        }
        try {
            const parsed = JSON.parse(secretKeys);
            if (isRecord(parsed)) {
                if (typeof parsed.default === "string" && parsed.default) return parsed.default;
                const firstKey = Object.values(parsed).find(value => typeof value === "string" && value);
                if (typeof firstKey === "string") return firstKey;
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }

    const secretKey = Deno.env.get("SUPABASE_SECRET_KEY");
    if (secretKey) return secretKey;
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new HttpError(500, `missing ${name}`);
    return value;
}
