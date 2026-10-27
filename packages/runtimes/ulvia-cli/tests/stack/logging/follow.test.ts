import { expect, test } from "bun:test";
import { CmsObservability, type LogQuery } from "@bernouy/cms-observability";
import { InMemoryJournalStore } from "@bernouy/cms-observability/memory";
import { readJournalUpdates, showInstanceLogs } from "../../../src/runtime/stack/logs";

for (const offset of [-3_600_000, 60_000]) {
    test(`follow includes producer clock skew ${offset} once, behind a full new page`, async () => {
        let clock = new Date("2026-10-26T12:00:00.000Z");
        const journal = new CmsObservability({
            store: new InMemoryJournalStore(),
            instanceId: "instance-a",
            cursorKey: "x".repeat(32),
            now: () => clock,
        });
        const entry = (time: string) => ({
            id: crypto.randomUUID(),
            time,
            level: "error" as const,
            event: "follow.probe",
            attributes: {},
        });
        const known = entry(clock.toISOString());
        await journal.append({ entries: [known] }, "cms-kernel");
        clock = new Date("2026-10-26T12:00:00.001Z");
        const input: LogQuery = { timeField: "receivedAt", limit: 200 };
        const client = { query: (query: LogQuery) => journal.query(query), get: (id: string) => journal.get({ id }) };
        const initial = await readJournalUpdates(client, input, new Set(), true);
        expect(initial.map(({ id }) => id)).toEqual([known.id]);
        const seen = new Set(initial.map(({ id }) => id));
        clock = new Date("2026-10-26T12:00:01.000Z");
        const skewed = entry(new Date(clock.getTime() + offset).toISOString());
        await journal.append({ entries: [skewed] }, "cms-kernel");
        clock = new Date("2026-10-26T12:00:02.000Z");
        for (let batch = 0; batch < 4; batch += 1) {
            await journal.append(
                { entries: Array.from({ length: 50 }, () => entry(clock.toISOString())) },
                "cms-kernel",
            );
        }
        clock = new Date("2026-10-26T12:00:03.000Z");
        const updates = await readJournalUpdates(client, input, seen, false);
        expect(updates).toHaveLength(201);
        expect(updates.filter(({ id }) => id === skewed.id)).toHaveLength(1);
        for (const item of updates) {
            seen.add(item.id);
        }
        clock = new Date("2026-10-26T12:02:00.000Z");
        expect(await readJournalUpdates(client, input, seen, false)).toEqual([]);
        const ordinary = await journal.query({ to: "2026-10-26T12:00:03.000Z", event: "follow.probe", limit: 200 });
        if (offset > 0) {
            expect(ordinary.items.some(({ id }) => id === skewed.id)).toBe(false);
        }
    });
}

test("the follow command explicitly selects server reception time", async () => {
    const stop = new Error("stop before polling");
    const requests: LogQuery[] = [];
    await expect(
        showInstanceLogs(
            ["kernel", "--follow"],
            {
                query: async (input) => {
                    requests.push(input);
                    throw stop;
                },
                get: async () => {
                    throw new Error("Unexpected detail query");
                },
            },
            () => undefined,
        ),
    ).rejects.toBe(stop);
    expect(requests).toMatchObject([{ timeField: "receivedAt", service: "cms-kernel" }]);
});
