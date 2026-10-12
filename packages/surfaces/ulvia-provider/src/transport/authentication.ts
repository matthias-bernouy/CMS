import { timingSafeEqual } from "node:crypto";

export function providerAuthorized(header: string | null, expected: string): boolean {
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}
