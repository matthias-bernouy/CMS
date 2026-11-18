import { expect, test } from "bun:test";
import { inventoryFixture } from "../../../fixtures/inventory";
import { pageScaleDataset } from "./dataset";
import { preparePageState } from "./preparation";
import { verifyPageRefusals } from "./verify";
import type { PageClient } from "../client";
import { pageMock } from "./mock";

test("large Page data owns exactly 64 Pages and removes every live fixture while preserving unrelated data", async () => {
    const fixture = await inventoryFixture();
    const mock = pageMock(fixture.measurement);
    mock.pages.set("foreign", { id: "foreign", title: "unrelated", path: "/unrelated", revision: 0 });
    const dataset = pageScaleDataset(mock.client, "http://localhost:1", async () => {
        throw Error("Large fixture has no gone probe");
    });
    await dataset.initialize(false);
    expect(mock.pages.size).toBe(65);
    expect(mock.events.filter((event) => event === "pages.create")).toHaveLength(64);
    await dataset.close();
    expect([...mock.pages.keys()]).toEqual(["foreign"]);
    await dataset.close();
    expect([...mock.pages.keys()]).toEqual(["foreign"]);
});

test("Page history retains 128 gone routes from 32 owned deletions, proving original and latest paths", async () => {
    const fixture = await inventoryFixture();
    const mock = pageMock(fixture.measurement);
    const checked: string[] = [];
    const dataset = pageScaleDataset(mock.client, "http://localhost:1", async (path) => {
        checked.push(path);
        expect(mock.routes.get(path)).toBe("gone");
    });
    await dataset.initialize(true);
    expect(mock.pages.size).toBe(0);
    expect(mock.routes.size).toBe(128);
    expect(mock.events.filter((event) => event === "pages.update-route")).toHaveLength(96);
    expect(checked).toHaveLength(64);
    expect(new Set(checked).size).toBe(64);
    await dataset.close();
    expect(mock.routes.size).toBe(128);
});

test("partial Page creation cleanup resolves only the exact attempted title/path and leaves other Pages untouched", async () => {
    const fixture = await inventoryFixture();
    const mock = pageMock(fixture.measurement);
    mock.pages.set("foreign", { id: "foreign", title: "unrelated", path: "/unrelated", revision: 0 });
    mock.loseCreate();
    const dataset = pageScaleDataset(mock.client, "http://localhost:1", async () => {});
    await expect(dataset.initialize(false)).rejects.toThrow("Create response lost");
    await dataset.close();
    expect([...mock.pages.keys()]).toEqual(["foreign"]);
});

test("Page preparation bounds payload/revisions, uses authoritative revisions and cleans a partially completed update", async () => {
    const fixture = await inventoryFixture();
    const mock = pageMock(fixture.measurement);
    for (const options of [
        { history: -1 },
        { history: 33 },
        { history: NaN },
        { contentBytes: 256 * 1024 + 1 },
        { invalidate: true },
    ]) {
        await expect(
            preparePageState(mock.client, "pages.create", "http", "/unit", "Owned", options),
        ).rejects.toThrow();
    }
    expect(mock.events).toEqual([]);
    const state = await preparePageState(mock.client, "pages.get", "http", "/unit", "Owned", {
        history: 16,
        contentBytes: 256 * 1024,
        invalidate: true,
    });
    expect(state.page!.revision).toBe(17);
    expect(state.page!.description).toBe(state.marker);
    expect(state.content!.length).toBeGreaterThan(256 * 1024);
    expect(mock.events.indexOf("pages.get")).toBeGreaterThan(mock.events.indexOf("pages.update"));
    mock.loseUpdate();
    await expect(
        preparePageState(mock.client, "pages.get", "http", "/failed", "Owned failing", { history: 2 }),
    ).rejects.toThrow();
    expect([...mock.pages.values()].some((page) => page.title === "Owned failing")).toBe(false);
});

test("natural Page rename retries preserve state while a different stale intent must be refused", async () => {
    const fixture = await inventoryFixture();
    const result = { id: "owned", revision: 18, title: "Renamed performance fixture", path: "/owned", visible: false };
    const persisted = { ...result, description: "Retained history", content: "" };
    const input = { id: result.id, expectedRevision: 17, title: result.title };
    for (const failure of ["none", "repeat-mutates", "stale-accepted"]) {
        const titles: string[] = [];
        let invalidProbes = 0;
        let foreignProbes = 0;
        let current = { ...persisted };
        const client: PageClient = async (capability, _binding, selected) => {
            if (capability === "pages.get") {
                return { output: { ...current }, observation: fixture.measurement };
            }
            expect(capability).toBe("pages.rename");
            expect(selected.expectedRevision).toBe(17);
            titles.push(String(selected.title));
            if (selected.title === result.title) {
                if (failure === "repeat-mutates") {
                    current = { ...current, revision: 19 };
                }
                const { id, revision, title, path, visible } = current;
                return { output: { id, revision, title, path, visible }, observation: fixture.measurement };
            }
            if (failure === "stale-accepted") {
                current = { ...current, title: String(selected.title), revision: 19 };
                return { output: { ...current }, observation: fixture.measurement };
            }
            return { output: undefined, observation: { ...fixture.measurement, validated: false, status: 409 } };
        };
        const options = {
            history: 16,
            invalid: async () => {
                invalidProbes++;
            },
            foreign: async () => {
                foreignProbes++;
                return { output: undefined, observation: { ...fixture.measurement, validated: false, status: 401 } };
            },
        };
        const execute = () => verifyPageRefusals(client, "pages.rename", input, result, persisted, options);
        if (failure === "none") {
            await execute();
            expect(titles).toEqual([result.title, "Rejected stale performance title"]);
            expect(current).toEqual(persisted);
        } else {
            await expect(execute()).rejects.toThrow(
                failure === "repeat-mutates" ? "page-scale-natural-retry-state" : "page-scale-stale-write",
            );
        }
        expect(invalidProbes).toBe(1);
        expect(foreignProbes).toBe(1);
    }
});
