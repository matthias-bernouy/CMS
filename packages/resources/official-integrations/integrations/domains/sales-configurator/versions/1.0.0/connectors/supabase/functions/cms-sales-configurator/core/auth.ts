import { requiredEnv } from "./env.ts";
import { HttpError } from "./errors.ts";

export function requireCmsRequest(request: Request): void {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, requiredEnv("CMS_SALES_CONFIGURATOR_API_KEY"))) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

export function cmsUserId(request: Request): string {
    const value = (request.headers.get("x-cms-user-id") ?? "").trim();
    if (!value) {
        throw new HttpError(401, "missing CMS user id");
    }
    return value;
}

export function requireCmsAdmin(request: Request): string {
    const role = (request.headers.get("x-cms-user-role") ?? "").trim();
    if (role !== "admin") {
        throw new HttpError(403, "CMS admin role is required");
    }
    return cmsUserId(request);
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
