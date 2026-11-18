import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { logReadDataset } from "./dataset";
import { prepareLogRead } from "./recipe";
import { logMock } from "./mock";
import type { LogCall } from "./dataset";

test("real-ingestion recipes bound batches and fully traverse signed cursors without credit for preparation", async () => {
    const fixture = await inventoryFixture();
    const mock = logMock(fixture.measurement);
    const dataset = logReadDataset(mock.ports, "owned-instance");
    await dataset.initialize("large");
    expect(mock.batches).toEqual([50, 50, 28]);
    expect(dataset.rows()).toHaveLength(128);
    const cursor = await dataset.walk("mcp");
    expect(typeof cursor).toBe("string");
    expect(mock.events.filter((event) => event === "logs.query")).toHaveLength(8);
    const aggregate = { ...dataset.filters, groupBy: "event" };
    const groups = await dataset.call("logs.aggregate", "http", aggregate, (output) =>
        dataset.assert("logs.aggregate", aggregate, output),
    );
    expect(groups.observation.validated).toBe(true);
    const other = logMock(fixture.measurement, "other-instance");
    let invalid = 0;
    const sample = await prepareLogRead(
        dataset,
        "logs.query",
        "mcp",
        "large",
        async () => ({ output: undefined, observation: { ...fixture.measurement, validated: false, status: 401 } }),
        other.ports.call,
        async () => {
            invalid++;
        },
    );
    await sample.send();
    await sample.verify!();
    expect(invalid).toBe(1);
    expect(other.events.filter((event) => event === "logs.query")).toHaveLength(2);
    const stored = JSON.stringify([...mock.rows.values()]);
    await dataset.replay();
    expect(JSON.stringify([...mock.rows.values()])).toBe(stored);
    await expect(dataset.append([])).rejects.toThrow("log-read-batch-bound");
    await expect(dataset.append(Array.from({ length: 51 }, () => dataset.make()))).rejects.toThrow(
        "log-read-batch-bound",
    );
});

test("journal history uses 128 old event timestamps plus eight fresh events without claiming old ingestion", async () => {
    const fixture = await inventoryFixture();
    const mock = logMock(fixture.measurement);
    const dataset = logReadDataset(mock.ports, "owned-instance");
    await dataset.initialize("history");
    const cutoff = Date.now() - 6 * 86_400_000;
    expect(dataset.rows().filter((row) => Date.parse(String(row.entry.time)) < cutoff)).toHaveLength(128);
    expect(dataset.rows().filter((row) => Date.parse(String(row.entry.time)) >= cutoff)).toHaveLength(8);
    expect(dataset.rows().every((row) => row.receivedAfter > Date.now() - 10000)).toBe(true);
    await dataset.walk("http");
});

test("query, aggregation and detail invalidation prime before append and enforce instance and cursor isolation", async () => {
    const fixture = await inventoryFixture();
    for (const capability of ["logs.query", "logs.aggregate", "logs.get"]) {
        const mock = logMock(fixture.measurement);
        const other = logMock(fixture.measurement, "other-instance");
        const dataset = logReadDataset(mock.ports, "owned-instance");
        let negative = 0;
        const foreign: LogCall = async () => ({
            output: undefined,
            observation: { ...fixture.measurement, validated: false, status: 401 },
        });
        const sample = await prepareLogRead(
            dataset,
            capability,
            "mcp",
            "invalidation",
            foreign,
            other.ports.call,
            async () => {
                negative++;
            },
        );
        expect(mock.events[0]).toBe(capability);
        expect(mock.batches).toEqual([1]);
        const calls = mock.events.length;
        expect((await sample.send()).validated).toBe(true);
        expect(mock.events.length - calls).toBe(1);
        await sample.verify!();
        expect(negative).toBe(1);
        expect(other.rows.size).toBe(0);
    }
});

test("a duplicate append that mutates retained detail is refused by the read scenario", async () => {
    const fixture = await inventoryFixture();
    const mock = logMock(fixture.measurement);
    const other = logMock(fixture.measurement, "other-instance");
    const dataset = logReadDataset(mock.ports, "owned-instance");
    const sample = await prepareLogRead(
        dataset,
        "logs.get",
        "http",
        "invalidation",
        async () => ({ output: undefined, observation: { ...fixture.measurement, validated: false, status: 403 } }),
        other.ports.call,
        async () => {},
    );
    await sample.send();
    mock.mutateDuplicate();
    await expect(sample.verify!()).rejects.toThrow("log-read-refusal-or-replay-mutated-state");
});
