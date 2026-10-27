import type { Filter } from "mongodb";
import type { JournalPosition, NormalizedLogQuery, StoredLogEntry } from "cms-observability/interfaces/Journal";

export interface JournalDocument extends Omit<StoredLogEntry, "expiresAt"> {
    expiresAt: Date;
}

export function mongoFilter(
    instanceId: string,
    query: NormalizedLogQuery,
    now: string,
    after?: JournalPosition,
): Filter<JournalDocument> {
    const filter: Record<string, unknown> = {
        instanceId,
        expiresAt: { $gt: new Date(now) },
        [query.timeField ?? "time"]: { $gte: query.from, $lt: query.to },
    };
    for (const field of [
        "service",
        "component",
        "event",
        "requestId",
        "invocationId",
        "contractId",
        "capabilityId",
    ] as const) {
        if (query[field] !== undefined) {
            filter[field] = query[field];
        }
    }
    if (query.levels) {
        filter.level = { $in: [...query.levels] };
    }
    if (query.eventPrefix) {
        const prefix = query.eventPrefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        filter.$and = [{ event: { $regex: `^${prefix}` } }];
    }
    if (after) {
        filter.$or = [
            { receivedAt: { $lt: after.receivedAt } },
            { receivedAt: after.receivedAt, id: { $lt: after.id } },
        ];
    }
    return filter;
}

export function fromDocument(document: JournalDocument): StoredLogEntry {
    const { _id: _id, ...entry } = document as JournalDocument & { _id?: unknown };
    return { ...entry, expiresAt: document.expiresAt.toISOString() };
}
