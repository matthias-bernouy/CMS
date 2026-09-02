import { HttpError } from "./http.ts";

function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) {
        throw new HttpError(500, `${name} is not configured`);
    }
    return value;
}

export function requireCmsRequest(request: Request): void {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token || !safeEqual(token, requiredEnv("CMS_FORMS_API_KEY"))) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

export function cmsUserId(request: Request): string {
    const value = request.headers.get("x-cms-user-id")?.trim() || "";
    if (!value || value.length > 200) {
        throw new HttpError(401, "trusted CMS user id is required");
    }
    return value;
}

export function requireCmsAdmin(request: Request): string {
    if (request.headers.get("x-cms-user-role")?.trim() !== "admin") {
        throw new HttpError(403, "CMS admin role is required");
    }
    return cmsUserId(request);
}

export function serviceRoleKey(): string {
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function supabaseUrl(): string {
    return requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let result = 0;
    for (let index = 0; index < left.length; index++) {
        result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
}
