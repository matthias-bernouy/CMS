import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { JournalPosition, NormalizedLogQuery } from "cms-observability/interfaces/Journal";
import { ObservabilityError } from "./validation";

interface Cursor extends JournalPosition {
    readonly instanceId: string;
    readonly from: string;
    readonly to: string;
    readonly hash: string;
    readonly expiresAt: number;
}

export function queryHash(query: NormalizedLogQuery): string {
    return createHash("sha256").update(JSON.stringify(query)).digest("base64url");
}

export function encodeCursor(value: Cursor, key: string): string {
    const body = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${body}.${sign(body, key).toString("base64url")}`;
}

export function decodeCursor(token: string, key: string, instanceId: string, now: number): Cursor {
    try {
        if (token.length > 1600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
            throw new Error();
        }
        const [body, signature] = token.split(".");
        const expected = sign(body!, key);
        const supplied = Buffer.from(signature!, "base64url");
        if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
            throw new Error();
        }
        const value = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as Cursor;
        if (value.instanceId !== instanceId || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) {
            throw new Error();
        }
        return value;
    } catch {
        throw new ObservabilityError("INVALID_CURSOR");
    }
}

function sign(body: string, key: string): Buffer {
    return createHmac("sha256", key).update(`ulvia-observability-cursor-v1\0${body}`).digest();
}
