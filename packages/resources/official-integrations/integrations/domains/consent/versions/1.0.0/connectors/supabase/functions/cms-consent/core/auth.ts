import { requiredEnv } from "./env.ts";
import { HttpError } from "./errors.ts";

export function requireCmsRequest(request: Request): void {
    const expected = requiredEnv("CMS_CONSENT_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token || !safeEqual(token, expected)) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

export async function subjectClaimHash(value: string): Promise<string> {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized.length > 320 || !normalized.includes("@")) {
        throw new HttpError(400, "subjectClaim must be a valid email address");
    }
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(requiredEnv("CMS_CONSENT_API_KEY")),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const payload = new TextEncoder().encode(`cms-consent-subject-claim-v1\0${normalized}`);
    const digest = await crypto.subtle.sign("HMAC", key, payload);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let result = 0;
    for (let index = 0; index < left.length; index += 1) {
        result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
}
