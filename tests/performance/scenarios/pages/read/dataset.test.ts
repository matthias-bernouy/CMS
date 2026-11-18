import { expect, test } from "bun:test";
import { inventoryFixture } from "../../../fixtures/inventory";
import { pageMock } from "../scale/mock";
import { pageReadDataset } from "./dataset";
import { preparePageList } from "./recipe";
import type { PageClient } from "../client";
import type { Observation } from "../../../harness/clients/types";

function listMock(observation: Observation) {
    const original = pageMock(observation);
    const listed: Readonly<Record<string, unknown>>[] = [];
    let staleTitle: string | undefined;
    const client: PageClient = async (capability, binding, input, assert = () => {}) => {
        if (capability !== "pages.list") {
            const result = await original.client(capability, binding, input);
            if (result.output && capability === "pages.create") {
                const output: Readonly<Record<string, unknown>> = { ...result.output, visible: false };
                original.pages.set(String(output.id), output);
                assert(output);
                return { ...result, output };
            }
            if (result.output) {
                assert(result.output);
            }
            return result;
        }
        listed.push(input);
        const rows = [...original.pages.values()]
            .filter((row) => String(row.title).includes(String(input.query)))
            .sort((a, b) => String(a.title).localeCompare(String(b.title)))
            .map(({ id, title, path, visible }) => ({ id, title, path, visible }));
        const start = input.cursor ? rows.findIndex((row) => row.id === input.cursor) + 1 : 0;
        const limit = Number(input.limit);
        const items = rows.slice(start, start + limit);
        if (staleTitle && items.length) {
            items[0] = { ...items[0]!, title: staleTitle };
        }
        const output = { items, ...(start + limit < rows.length ? { nextCursor: items.at(-1)!.id } : {}) };
        assert(output);
        return { observation, output };
    };
    return {
        ...original,
        client,
        listed,
        stale: (title: string) => {
            staleTitle = title;
        },
    };
}

test("Page list volume has command-backed exact pagination and scoped cleanup", async () => {
    const fixture = await inventoryFixture();
    const mock = listMock(fixture.measurement);
    mock.pages.set("foreign", { id: "foreign", title: "Unrelated", path: "/foreign", visible: true });
    const dataset = pageReadDataset(mock.client, "http://localhost:1");
    await dataset.initialize("large");
    expect(dataset.rows()).toHaveLength(64);
    let denied = 0;
    let invalid = 0;
    const sample = await preparePageList(
        mock.client,
        dataset,
        "mcp",
        "large",
        2,
        async () => {
            denied++;
            return { output: undefined, observation: { ...fixture.measurement, validated: false, status: 401 } };
        },
        async () => {
            invalid++;
        },
    );
    const before = mock.listed.length;
    expect((await sample.send()).validated).toBe(true);
    expect(mock.listed.length - before).toBe(1);
    expect(mock.listed.at(-1)!.cursor).toBe(dataset.rows()[31]!.id);
    await sample.verify!();
    expect(denied).toBe(1);
    expect(invalid).toBe(1);
    expect(mock.listed.some((input) => input.cursor === dataset.rows().at(-1)!.id)).toBe(true);
    await dataset.close();
    expect([...mock.pages.keys()]).toEqual(["foreign"]);
});

test("Page list history excludes 32 deleted Pages while retaining 128 gone routes", async () => {
    const fixture = await inventoryFixture();
    const mock = listMock(fixture.measurement);
    let probes = 0;
    const dataset = pageReadDataset(mock.client, "http://localhost:1", async (path) => {
        probes++;
        expect(mock.routes.get(path)).toBe("gone");
    });
    await dataset.initialize("history");
    expect(probes).toBe(64);
    expect(dataset.rows()).toHaveLength(1);
    expect(mock.pages.size).toBe(1);
    await dataset.close();
    expect(mock.pages.size).toBe(0);
    expect(mock.routes.size).toBe(129);
});

test("Page list invalidation primes before rename, rejects stale data and recovers lost anchor receipts", async () => {
    const fixture = await inventoryFixture();
    const mock = listMock(fixture.measurement);
    const dataset = pageReadDataset(mock.client, "http://localhost:1");
    await dataset.initialize("invalidation");
    const title = dataset.rows()[0]!.title;
    const sample = await preparePageList(
        mock.client,
        dataset,
        "http",
        "invalidation",
        0,
        async () => ({ output: undefined, observation: { ...fixture.measurement, validated: false, status: 403 } }),
        async () => {},
    );
    expect(mock.listed).toHaveLength(1);
    expect(dataset.rows()[0]!.title).toBe(`${title}-0`);
    expect((await sample.send()).validated).toBe(true);
    await sample.verify!();
    mock.stale(title);
    await expect(sample.send()).rejects.toThrow("page-list-exact-page");
    // Cleanup does not rely on a reader assertion or the old title after a rename.
    await dataset.close();
    expect(mock.pages.size).toBe(0);
    const lost = listMock(fixture.measurement);
    const partial = pageReadDataset(lost.client, "http://localhost:1");
    lost.loseCreate();
    await expect(partial.initialize("invalidation")).rejects.toThrow("Create response lost");
    await partial.close();
    expect(lost.pages.size).toBe(0);
});
