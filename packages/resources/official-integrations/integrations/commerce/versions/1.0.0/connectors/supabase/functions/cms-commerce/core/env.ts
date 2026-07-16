import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) throw new HttpError(500, `missing ${name}`);
    return value;
}
export function serviceRoleKey(): string {
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        if (!secretKeys.trim().startsWith("{")) {
            const first = secretKeys.split(",").map(value => value.trim()).find(Boolean);
            if (first) return first;
        }
        try {
            const parsed = JSON.parse(secretKeys);
            if (isRecord(parsed)) {
                if (typeof parsed.default === "string" && parsed.default) return parsed.default;
                const first = Object.values(parsed).find(value => typeof value === "string" && value);
                if (typeof first === "string") return first;
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }
    return Deno.env.get("SUPABASE_SECRET_KEY")
        ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        ?? requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}
