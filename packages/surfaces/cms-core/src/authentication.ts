import { timingSafeEqual } from "node:crypto";

export function assertProviderToken(token: string): void {
    if (token.length < 24 || token.length > 512 || /[\r\n]/u.test(token)) {
        throw new TypeError("The CMS Core provider token is invalid.");
    }
}

export function providerAuthorized(header: string | null, expected: string): boolean {
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}
