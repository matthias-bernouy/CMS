import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { LogCall } from "./dataset";
import type { Observation } from "../../harness/clients/types";
import { requireRecord } from "../queries/types";

export function logMock(observation: Observation, instanceId = "owned-instance") {
    const rows = new Map<string, Readonly<Record<string, unknown>>>();
    const cursors = new Map<string, { scope: string; offset: number }>();
    const batches: number[] = [];
    const events: string[] = [];
    let mutateDuplicate = false;
    const failure = (status: number, binding: string, code: string) => ({
        output: undefined,
        observation: {
            ...observation,
            status: binding === "mcp" ? 200 : status,
            validated: false,
            failure: binding === "mcp" ? `mcp-declared-${code}` : `http-status-${status}`,
        },
    });
    const call: LogCall = async (capability, binding, input, assert = () => {}) => {
        events.push(capability);
        let output: unknown;
        if (capability === "logs.get") {
            output = rows.get(String(input.id));
            if (!output) {
                return failure(404, binding, "NOT_FOUND");
            }
        } else {
            const matches = [...rows.values()]
                .filter(
                    (row) =>
                        String(row.event).startsWith(String(input.eventPrefix)) &&
                        String(row.time) >= String(input.from) &&
                        String(row.time) < String(input.to),
                )
                .sort(
                    (a, b) =>
                        String(b.receivedAt).localeCompare(String(a.receivedAt)) ||
                        String(b.id).localeCompare(String(a.id)),
                );
            if (capability === "logs.aggregate") {
                const counts = new Map<string, number>();
                for (const row of matches) {
                    const level = String(row[String(input.groupBy)]);
                    counts.set(level, (counts.get(level) ?? 0) + 1);
                }
                output = {
                    total: matches.length,
                    groups: [...counts]
                        .map(([key, count]) => ({ key, count }))
                        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
                        .slice(0, 50),
                    truncated: counts.size > 50,
                };
            } else {
                const { cursor, ...query } = input;
                const scope = canonicalizeIJson(query);
                const saved = cursor ? cursors.get(String(cursor)) : null;
                if (cursor && (!saved || saved.scope !== scope)) {
                    return failure(422, binding, "INVALID_CURSOR");
                }
                const offset = saved?.offset ?? 0;
                const limit = Number(input.limit);
                let nextCursor: string | null = null;
                if (offset + limit < matches.length) {
                    nextCursor = crypto.randomUUID();
                    cursors.set(nextCursor, { scope, offset: offset + limit });
                }
                output = {
                    items: matches.slice(offset, offset + limit).map(({ attributes: _attributes, ...row }) => row),
                    nextCursor,
                    from: input.from,
                    to: input.to,
                };
            }
        }
        const copy = structuredClone(output);
        assert(copy);
        return { output: copy, observation };
    };
    const append = async (entries: readonly Readonly<Record<string, unknown>>[]) => {
        batches.push(entries.length);
        let stored = 0;
        for (const entry of entries) {
            const id = String(entry.id);
            if (rows.has(id)) {
                if (mutateDuplicate) {
                    rows.set(id, { ...rows.get(id)!, receivedAt: new Date(Date.now() + 1000).toISOString() });
                }
                continue;
            }
            stored++;
            rows.set(id, {
                ...structuredClone(entry),
                attributes: { ...requireRecord(entry.attributes), password: "[REDACTED]" },
                receivedAt: new Date().toISOString(),
                instanceId,
                service: "cms-edge",
            });
        }
        return { output: { accepted: entries.length, stored, duplicates: entries.length - stored }, observation };
    };
    return {
        rows,
        cursors,
        batches,
        events,
        ports: { call, append },
        mutateDuplicate: () => {
            mutateDuplicate = true;
        },
    };
}
