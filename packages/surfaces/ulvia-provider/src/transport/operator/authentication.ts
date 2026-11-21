import { timingSafeEqual } from "node:crypto";

export function operatorAuthorized(request: Request, expected: string): boolean {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    return operatorTokenMatches(header.slice(7), expected);
}

export function operatorTokenMatches(value: string, expected: string): boolean {
    const received = Buffer.from(value);
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}
