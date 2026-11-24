import { createHash } from "node:crypto";
import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { ContractEventDefinition } from "@bernouy/ulvia-contracts";
import { EventsError } from "./errors";
export function eventHash(value: unknown): string {
    return createHash("sha256").update("ulvia-events/v1\0").update(canonicalizeIJson(value)).digest("hex");
}
export function eventJson(json: string, limit = 1048576): unknown {
    try {
        return parseStrictJson(new TextEncoder().encode(json), limit, 32);
    } catch {
        throw new EventsError("INVALID_INPUT");
    }
}
export function eventId(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
        throw new EventsError("INVALID_INPUT");
    }
}
export function eventDigest(value: string): void {
    if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
        throw new EventsError("INVALID_INPUT");
    }
}
export function pageSize(limit: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new EventsError("INVALID_INPUT");
    }
}
export function encodeCursor(scope: unknown, id: string): string {
    return `${eventHash(scope)}:${id}`;
}
export function decodeCursor(scope: unknown, cursor: string | undefined): string | undefined {
    if (cursor === undefined) {
        return undefined;
    }
    const prefix = `${eventHash(scope)}:`;
    if (!cursor.startsWith(prefix) || !/^[a-f0-9]{64}$/u.test(cursor.slice(prefix.length))) {
        throw new EventsError("INVALID_INPUT");
    }
    return cursor.slice(prefix.length);
}

/** Only the event's executable declaration affects subscription compatibility. */
export function eventDefinitionDigest(event: ContractEventDefinition): string {
    return `sha256:${eventHash({
        id: event.id,
        schema: event.schema,
        sensitive: event.sensitive,
        ...(event.filterKeys ? { filterKeys: event.filterKeys } : {}),
    })}`;
}
