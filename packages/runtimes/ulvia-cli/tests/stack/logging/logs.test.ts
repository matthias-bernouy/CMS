import { expect, test } from "bun:test";
import { showInstanceLogs, readJournalUpdates } from "../../../src/runtime/stack/logs";
import { parseSelection } from "../../../src/runtime/stack/logs/selection";

const item = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    instanceId: "instance-a",
    service: "cms-edge",
    level: "error" as const,
    event: "page.render.failed",
};

test("instance logs send service, level and correlation filters to the selected contract", async () => {
    const requests: unknown[] = [];
    const output: string[] = [];
    await showInstanceLogs(
        ["edge", "--level", "warn", "--event", item.event, "--json"],
        {
            query: async (input) => {
                requests.push(input);
                return { items: [item] };
            },
            get: async () => {
                throw new Error("Summary queries must not download entry details");
            },
        },
        (line) => output.push(line),
    );
    expect(requests).toEqual([
        { service: "cms-edge", levels: ["warn", "error", "fatal"], event: item.event, limit: 200 },
    ]);
    expect(JSON.parse(output[0]!).event).toBe(item.event);
});

test("stack details are fetched only for the returned entry and cannot select another instance", async () => {
    const ids: string[] = [];
    const output: string[] = [];
    await showInstanceLogs(
        ["edge", "--stack"],
        {
            query: async () => ({ items: [item] }),
            get: async (id) => {
                ids.push(id);
                return {
                    ...item,
                    attributes: {},
                    error: { name: "Error", message: "failed", stack: "Error: failed\n    at test.ts:1" },
                };
            },
        },
        (line) => output.push(line),
    );
    expect(ids).toEqual([item.id]);
    expect(output[0]).toContain("test.ts:1");
    expect(() => parseSelection(["--instance-id", "other"])).toThrow("Unknown logs option");
    await expect(
        showInstanceLogs(
            ["repository"],
            {
                query: async () => ({ items: [] }),
                get: async () => {
                    throw new Error();
                },
            },
            () => undefined,
        ),
    ).rejects.toThrow("operator");
});

test("follow reads subsequent server pages before returning to polling", async () => {
    const old = { ...item, id: crypto.randomUUID() };
    const newest = { ...item, id: crypto.randomUUID() };
    const previous = { ...item, id: crypto.randomUUID() };
    const requests: unknown[] = [];
    const result = await readJournalUpdates(
        {
            query: async (input) => {
                requests.push(input);
                return input.cursor
                    ? { items: [previous, old], nextCursor: "unused" }
                    : { items: [newest], nextCursor: "next" };
            },
            get: async () => {
                throw new Error();
            },
        },
        { limit: 200 },
        new Set([old.id]),
        false,
    );
    expect(result.map(({ id }) => id)).toEqual([previous.id, newest.id]);
    expect(requests).toEqual([{ limit: 200 }, { limit: 200, cursor: "next" }]);
});
