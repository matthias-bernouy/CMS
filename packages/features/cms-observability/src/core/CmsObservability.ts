import { createHash } from "node:crypto";
import { sanitizeAttributes, sanitizeError } from "@bernouy/logging";
import type { JournalStore, LogGroup, LogQuery, StoredLogEntry } from "cms-observability/interfaces/Journal";
import { decodeCursor, encodeCursor, queryHash } from "./cursor";
import { detail, summary } from "./projections";
import { normalizeQuery, object, ObservabilityError, parseEntry, parseGroup, text } from "./validation";

export class CmsObservability {
    constructor(
        private readonly options: {
            store: JournalStore;
            instanceId: string;
            cursorKey: string;
            now?: () => Date;
            retentionDays?: number;
        },
    ) {
        text(options.instanceId);
        if (
            options.cursorKey.length < 32 ||
            !Number.isInteger(options.retentionDays ?? 14) ||
            (options.retentionDays ?? 14) < 1 ||
            (options.retentionDays ?? 14) > 365
        ) {
            throw new TypeError("Invalid observability configuration");
        }
    }

    async append(input: unknown, service: string) {
        text(service);
        const batch = object(input, ["entries"]);
        if (!Array.isArray(batch.entries) || batch.entries.length < 1 || batch.entries.length > 50) {
            throw new ObservabilityError("INVALID_INPUT");
        }
        const now = this.now();
        const entries: StoredLogEntry[] = batch.entries.map((value) => {
            const parsed = parseEntry(value);
            if (Date.parse(parsed.time) > now.getTime() + 300_000) {
                throw new ObservabilityError("INVALID_INPUT");
            }
            const sanitized = sanitizeAttributes(parsed.attributes);
            const attributes = Object.fromEntries(
                Object.entries(sanitized)
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([key, value]) => [key, String(value).slice(0, 1024)]),
            );
            const { error: rawError, ...rest } = parsed;
            const error = rawError
                ? sanitizeError(
                      Object.assign(new Error(rawError.message), { name: rawError.name, stack: rawError.stack }),
                      true,
                  )
                : undefined;
            const entry = { ...rest, attributes, ...(error ? { error } : {}) };
            return {
                ...entry,
                ...(service.startsWith("provider:")
                    ? { id: producerId(service, parsed.id), sourceEntryId: parsed.id }
                    : {}),
                instanceId: this.options.instanceId,
                service,
                receivedAt: now.toISOString(),
                expiresAt: new Date(now.getTime() + (this.options.retentionDays ?? 14) * 86_400_000).toISOString(),
                fingerprint: createHash("sha256")
                    .update(
                        JSON.stringify({ service, entry }, (_key, value) =>
                            value && typeof value === "object" && !Array.isArray(value)
                                ? Object.fromEntries(
                                      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
                                  )
                                : value,
                        ),
                    )
                    .digest("hex"),
            };
        });
        const result = await this.options.store.append(entries);
        return { accepted: entries.length, ...result };
    }

    async query(value: unknown) {
        const now = this.now();
        const input = object(value, [
            "timeField",
            "from",
            "to",
            "levels",
            "minLevel",
            "service",
            "component",
            "event",
            "eventPrefix",
            "requestId",
            "invocationId",
            "contractId",
            "capabilityId",
            "limit",
            "cursor",
        ]);
        const cursor =
            input.cursor === undefined || input.cursor === ""
                ? undefined
                : decodeCursor(
                      text(input.cursor, 1600),
                      this.options.cursorKey,
                      this.options.instanceId,
                      now.getTime(),
                  );
        const query = normalizeQuery(input, now, cursor);
        const hash = queryHash(query);
        if (cursor && cursor.hash !== hash) {
            throw new ObservabilityError("INVALID_CURSOR");
        }
        const rows = await this.options.store.query(this.options.instanceId, query, now.toISOString(), cursor);
        const items = rows.slice(0, query.limit);
        const last = items.at(-1);
        return {
            items: items.map(summary),
            nextCursor:
                rows.length > query.limit && last
                    ? encodeCursor(
                          {
                              instanceId: this.options.instanceId,
                              from: query.from,
                              to: query.to,
                              hash,
                              receivedAt: last.receivedAt,
                              id: last.id,
                              expiresAt: now.getTime() + 900_000,
                          },
                          this.options.cursorKey,
                      )
                    : null,
            from: query.from,
            to: query.to,
        };
    }

    async get(input: unknown) {
        const { id } = object(input, ["id"]);
        const entry = await this.options.store.get(this.options.instanceId, text(id, 36), this.now().toISOString());
        if (!entry) {
            throw new ObservabilityError("NOT_FOUND");
        }
        return detail(entry);
    }

    async aggregate(input: unknown) {
        const { groupBy, ...filters } = object(input, [
            "timeField",
            "from",
            "to",
            "levels",
            "minLevel",
            "service",
            "component",
            "event",
            "eventPrefix",
            "requestId",
            "invocationId",
            "contractId",
            "capabilityId",
            "groupBy",
        ]);
        const now = this.now();
        const query = normalizeQuery(filters as LogQuery, now);
        return this.options.store.aggregate(
            this.options.instanceId,
            query,
            parseGroup(groupBy) as LogGroup,
            now.toISOString(),
        );
    }

    private now(): Date {
        return this.options.now?.() ?? new Date();
    }
}

function producerId(service: string, id: string): string {
    const value = createHash("sha256").update(`ulvia-journal-producer-v1\0${service}\0${id}`).digest("hex");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
}
