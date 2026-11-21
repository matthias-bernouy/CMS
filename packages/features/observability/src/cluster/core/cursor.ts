import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ClusterPosition, ClusterSource } from "observability/cluster/interfaces/ClusterJournal";
import { ClusterLogsError } from "./errors";

export interface ClusterCursor {
    readonly version: 1;
    readonly scope: string;
    readonly hash: string;
    readonly from: string;
    readonly to: string;
    readonly expiresAt: number;
    readonly after: ClusterPosition;
    readonly excluded: readonly ClusterSource[];
}
export function clusterQueryHash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}
/** Mongo keyset ordering uses binary string comparison, never locale collation. */
export function compareClusterPositions(left: ClusterPosition, right: ClusterPosition): number {
    for (const key of ["receivedAt", "id", "instanceId"] as const) {
        if (left[key] !== right[key]) {
            return left[key] < right[key] ? 1 : -1;
        }
    }
    return 0;
}
function sign(body: string, key: string): Buffer {
    return createHmac("sha256", key).update(`ulvia-cluster-logs-cursor-v1\0${body}`).digest();
}
export function encodeClusterCursor(value: ClusterCursor, key: string): string {
    const body = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${body}.${sign(body, key).toString("base64url")}`;
}
export function decodeClusterCursor(token: string, key: string, scope: string, now: number): ClusterCursor {
    try {
        if (token.length > 6000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
            throw new Error();
        }
        const [body, signature] = token.split(".");
        const expected = sign(body!, key);
        const supplied = Buffer.from(signature!, "base64url");
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
            throw new Error();
        }
        const value = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as ClusterCursor;
        if (
            value.version !== 1 ||
            value.scope !== scope ||
            !Number.isFinite(value.expiresAt) ||
            value.expiresAt <= now
        ) {
            throw new Error();
        }
        return value;
    } catch {
        throw new ClusterLogsError("INVALID_CURSOR");
    }
}
