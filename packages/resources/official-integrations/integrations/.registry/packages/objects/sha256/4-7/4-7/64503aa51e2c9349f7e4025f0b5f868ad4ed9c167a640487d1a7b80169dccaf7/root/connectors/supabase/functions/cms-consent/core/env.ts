import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new HttpError(500, `missing ${name}`);
    }
    return value;
}

export function serviceRoleKey(): string {
    const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (keys) {
        const trimmed = keys.trim();
        if (!trimmed.startsWith("{")) {
            const first = trimmed
                .split(",")
                .map((value) => value.trim())
                .find(Boolean);
            if (first) {
                return first;
            }
        } else {
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
            }
            if (isRecord(parsed)) {
                if (typeof parsed.default === "string" && parsed.default) {
                    return parsed.default;
                }
                const first = Object.values(parsed).find((value) => typeof value === "string" && value);
                if (typeof first === "string") {
                    return first;
                }
            }
        }
    }
    const modernKey = Deno.env.get("SUPABASE_SECRET_KEY");
    if (modernKey) {
        return modernKey;
    }
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}
