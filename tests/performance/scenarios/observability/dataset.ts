import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { assertLogAggregate, assertLogEntry, assertLogQuery, compareLogPosition } from "./oracle";
import type { SeededLog } from "./oracle";
import type { ScenarioClient } from "../../harness/clients/session";

export type LogCall = (
    capability: string,
    binding: string,
    input: Readonly<Record<string, unknown>>,
    assert?: (output: unknown) => void,
) => ReturnType<ScenarioClient>;
type LogPorts = Readonly<{
    call: LogCall;
    append: (entries: readonly Readonly<Record<string, unknown>>[]) => ReturnType<ScenarioClient>;
}>;

export function logReadDataset(ports: LogPorts, instanceId: string) {
    const marker = `performance.read.${randomUUID().replaceAll("-", "")}`;
    const now = Date.now();
    const window = { from: new Date(now - 8 * 86_400_000).toISOString(), to: new Date(now + 300_000).toISOString() };
    const filters = { ...window, eventPrefix: marker, service: "cms-edge" };
    const rows = new Map<string, SeededLog>();
    let sequence = 0;
    const make = (historical = false) => {
        const index = sequence++;
        return {
            id: randomUUID(),
            time: new Date(now - (historical ? 7 * 86_400_000 : 60_000) - index).toISOString(),
            level: ["info", "warn", "error"][index % 3]!,
            event: `${marker}.entry${String(index).padStart(3, "0")}`,
            attributes: { fixture: marker, password: "never-store-performance-secret", padding: "p".repeat(1024) },
        };
    };
    const append = async (entries: readonly Readonly<Record<string, unknown>>[]) => {
        assertCondition(
            entries.length > 0 &&
                entries.length <= 50 &&
                rows.size + entries.length <= 256 &&
                entries.every((entry) => typeof entry.id === "string" && !rows.has(entry.id)),
            "log-read-batch-bound",
        );
        const receivedAfter = Date.now();
        const result = await ports.append(entries);
        const receivedBefore = Date.now();
        const output = requireRecord(result.output);
        assertCondition(
            result.observation.validated &&
                output.accepted === entries.length &&
                output.stored === entries.length &&
                output.duplicates === 0,
            "log-read-append-receipt",
        );
        for (const entry of entries) {
            rows.set(String(entry.id), { entry: structuredClone(entry), receivedAfter, receivedBefore });
        }
    };
    const assert = (capability: string, input: Readonly<Record<string, unknown>>, output: unknown) => {
        const seeds = [...rows.values()];
        if (capability === "logs.get") {
            const seed = rows.get(String(input.id));
            assertCondition(seed, "log-read-seed-missing");
            assertLogEntry(output, seed, instanceId, true);
        } else if (capability === "logs.aggregate") {
            assertLogAggregate(output, seeds, input.groupBy === "event" ? "event" : "level");
        } else {
            assertLogQuery(output, seeds, instanceId, window, seeds.length);
        }
    };
    return {
        marker,
        window,
        filters,
        call: ports.call,
        make,
        append,
        assert,
        rows: () => [...rows.values()],
        async initialize(variant: string) {
            if (variant === "invalidation") {
                return;
            }
            const deadline = Date.now() + 180_000;
            const entries = Array.from({ length: 128 }, () => make(variant === "history"));
            if (variant === "history") {
                entries.push(...Array.from({ length: 8 }, () => make()));
            }
            for (let start = 0; start < entries.length; start += 50) {
                assertCondition(Date.now() <= deadline, "log-read-preparation-deadline");
                await append(entries.slice(start, start + 50));
            }
        },
        async walk(binding: string) {
            const seeds = [...rows.values()];
            const all: Readonly<Record<string, unknown>>[] = [];
            const cursors = new Set<string>();
            let cursor: string | undefined;
            let firstCursor: string | null = null;
            for (let index = 0; index < 17; index++) {
                let next: string | null = null;
                const result = await ports.call(
                    "logs.query",
                    binding,
                    { ...filters, limit: 16, ...(cursor ? { cursor } : {}) },
                    (output) => {
                        const page = assertLogQuery(output, seeds, instanceId, window, seeds.length - all.length);
                        all.push(...page.items);
                        next = page.nextCursor;
                        firstCursor ??= next;
                    },
                );
                assertCondition(result.observation.validated, "log-read-pagination-failed");
                if (!next) {
                    assertCondition(
                        all.length === seeds.length &&
                            new Set(all.map((row) => row.id)).size === seeds.length &&
                            canonicalizeIJson(all) === canonicalizeIJson([...all].sort(compareLogPosition)),
                        "log-read-pagination-completeness",
                    );
                    return firstCursor;
                }
                assertCondition(!cursors.has(next), "log-read-repeated-cursor");
                cursors.add(next);
                cursor = next;
            }
            throw Error("Log pagination exceeded its bound");
        },
        async replay() {
            const result = await ports.append([[...rows.values()][0]!.entry]);
            const output = requireRecord(result.output);
            assertCondition(
                result.observation.validated && output.accepted === 1 && output.stored === 0 && output.duplicates === 1,
                "log-read-duplicate-receipt",
            );
        },
        // Logs are immutable retained domain records, removed only with the isolated stack.
    };
}

export type LogReadDataset = ReturnType<typeof logReadDataset>;
