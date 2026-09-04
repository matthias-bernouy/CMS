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
        if (!keys.trim().startsWith("{")) {
            const first = keys
                .split(",")
                .map((value) => value.trim())
                .find(Boolean);
            if (first) {
                return first;
            }
        }
        try {
            const parsed = JSON.parse(keys);
            if (isRecord(parsed)) {
                const preferred = typeof parsed.default === "string" ? parsed.default : undefined;
                const first = Object.values(parsed).find((value) => typeof value === "string" && value);
                if (preferred || first) {
                    return (preferred ?? first) as string;
                }
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }
    return (
        Deno.env.get("SUPABASE_SECRET_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
        requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
    );
}
