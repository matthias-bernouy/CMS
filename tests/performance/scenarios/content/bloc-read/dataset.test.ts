import { expect, test } from "bun:test";
import { inventoryFixture } from "../../../fixtures/inventory";
import { blocReadDataset } from "./dataset";
import { prepareBlocRead } from "./recipe";
import { blocMock } from "./mock";

test("Bloc read data retains 64 published or archived compositions and cleanup preserves unrelated records", async () => {
    const fixture = await inventoryFixture();
    for (const variant of ["large", "history"]) {
        const mock = blocMock(fixture.measurement);
        mock.rows.set("foreign", { tag: "foreign", name: "Unrelated", group: "Other", lifecycle: "active" });
        const dataset = blocReadDataset(mock.client);
        await dataset.initialize(variant);
        expect(dataset.rows()).toHaveLength(variant === "large" ? 64 : 65);
        expect(dataset.rows().filter((row) => row.lifecycle === "archived")).toHaveLength(variant === "large" ? 0 : 64);
        expect(dataset.rows().filter((row) => row.publishedRevision === 1)).toHaveLength(variant === "large" ? 64 : 1);
        await dataset.close();
        expect(mock.rows.get("foreign")!.lifecycle).toBe("active");
        expect(dataset.rows().every((row) => row.lifecycle === "archived")).toBe(true);
    }
});

test("each Bloc reader primes before publication and refuses foreign sessions and stale writes without mutation", async () => {
    const fixture = await inventoryFixture();
    for (const capability of ["site-blocs.list", "site-blocs.get", "pages.editor-catalogue"]) {
        const mock = blocMock(fixture.measurement);
        const dataset = blocReadDataset(mock.client);
        await dataset.initialize("invalidation");
        let denied = 0;
        let invalid = 0;
        const sample = await prepareBlocRead(
            dataset,
            capability,
            "mcp",
            "invalidation",
            0,
            async () => {
                denied++;
                return { output: undefined, observation: { ...fixture.measurement, validated: false, status: 401 } };
            },
            async () => {
                invalid++;
            },
        );
        expect(mock.events.indexOf(capability)).toBeLessThan(mock.events.indexOf("site-blocs.publish"));
        const calls = mock.events.length;
        expect((await sample.send()).validated).toBe(true);
        expect(mock.events.length - calls).toBe(1);
        await sample.verify!();
        expect(denied).toBe(1);
        expect(invalid).toBe(1);
        await dataset.close();
        expect(dataset.rows()[0]!.lifecycle).toBe("archived");
    }
});

test("Bloc cleanup recovers lost creation receipts and a mutated refusal cannot pass verification", async () => {
    const fixture = await inventoryFixture();
    const mock = blocMock(fixture.measurement);
    const dataset = blocReadDataset(mock.client);
    mock.loseCreate();
    await expect(dataset.initialize("large")).rejects.toThrow("Owned create response lost");
    await dataset.close();
    expect([...mock.rows.values()].every((row) => row.lifecycle === "archived")).toBe(true);
    const sample = await prepareBlocRead(
        dataset,
        "site-blocs.get",
        "http",
        "invalidation",
        0,
        async () => ({ output: undefined, observation: { ...fixture.measurement, validated: false, status: 403 } }),
        async (tag) => {
            mock.rows.set(tag, { ...mock.rows.get(tag)!, name: "Unexpected mutation" });
        },
    );
    await sample.send();
    await expect(sample.verify!()).rejects.toThrow("bloc-read-refusal-mutated-state");
    await dataset.close();
});
