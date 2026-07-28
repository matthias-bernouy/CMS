import { HttpError } from "./errors.ts";
import { one } from "./rest.ts";

export async function requireCmsRequest(request: Request): Promise<void> {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) {
        throw new HttpError(401, "invalid CMS API key");
    }
    const configured = Deno.env.get("CMS_PHOTO_ALBUMS_API_KEY")?.trim();
    if (configured) {
        if (!safeEqual(token, configured)) {
            throw new HttpError(401, "invalid CMS API key");
        }
        return;
    }
    const credential = await one("connector_credentials", { credential_key: "cms_api_key" }, "secret_hash");
    const expected = typeof credential?.secret_hash === "string" ? credential.secret_hash : "";
    const actual = await sha256(token);
    if (!expected || !safeEqual(actual, expected)) {
        throw new HttpError(401, "invalid CMS API key");
    }
}

async function sha256(value: string): Promise<string> {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
