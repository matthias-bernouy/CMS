import { HttpError } from "./errors.ts";

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) {
        throw new HttpError(500, `${name} is not configured`);
    }
    return value;
}

export function serviceRoleKey(): string {
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}
