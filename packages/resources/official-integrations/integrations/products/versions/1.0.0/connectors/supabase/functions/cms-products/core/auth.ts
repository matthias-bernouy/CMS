import { HttpError } from "./errors.ts";
import { requiredEnv } from "./env.ts";

export function requireCmsWriteRequest(request: Request): void {
    requireCmsRequest(request);
    const userId = (request.headers.get("x-cms-user-id") ?? "").trim();
    if (!userId) throw new HttpError(401, "missing CMS user id");
}

export function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_PRODUCTS_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || !safeEqual(token, expected)) throw new HttpError(401, "invalid CMS API key");
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let i = 0; i < left.length; i++) {
        result |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return result === 0;
}
