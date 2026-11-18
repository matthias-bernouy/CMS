import { expect, test } from "bun:test";
import { fileReadOracle, rasterReference } from "../oracle";
import { pngFixture } from "../../../../fixtures/png";
import { officialCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan, coverageMatrix } from "../../../../capabilities/coverage";
import { fileScenarios } from "../../plan";
import type { StoredRaster } from "../state/upload";

const file: StoredRaster = {
    reference: {
        fileId: "unit-file",
        generation: "unit-generation",
        namespaceId: "unit-namespace",
        name: "unit.png",
        mimeType: "image/png",
        size: pngFixture().byteLength,
        visibility: "public",
    },
    bytes: pngFixture(),
    dimension: 64,
    derived: false,
};

test("file body and metadata oracles reject truncation, another generation and duplicate pagination rows", async () => {
    const body = fileReadOracle(file, "http://unit.test", "files.read", [file], 0);
    await body(file.bytes);
    await expect(body(file.bytes.slice(1))).rejects.toThrow("file-byte-body-mismatch");
    const get = fileReadOracle(file, "http://unit.test", "files.get", [file], 0);
    const reference = rasterReference(file, "http://unit.test");
    await get(reference);
    await expect(get({ ...reference, generation: "old" })).rejects.toThrow("file-metadata-or-pagination-mismatch");
    const list = fileReadOracle(file, "http://unit.test", "files.list", [file], 0);
    await list({ items: [reference], offset: 0, limit: 16 });
    await expect(list({ items: [reference, reference], offset: 0, limit: 16 })).rejects.toThrow();
    await fileReadOracle(file, "http://unit.test", "files.list", [file], 1)({ items: [], offset: 1, limit: 16 });
});

test("the current Files plan defines all mandatory variants without crediting preparation or retained aliases", async () => {
    const inventory = await officialCapabilityInventory();
    const scoped = {
        ...inventory,
        targets: inventory.targets.filter((row) => !row.retained && row.release.contractId === "ulvia/cms.files"),
        templates: [],
    };
    const definitions = fileScenarios(inventory, "unit-files-plan").map((row) => row.definition);
    const added = definitions.filter((row) => row.id.startsWith("files-read."));
    expect(added).toHaveLength(12);
    expect(auditPlan(scoped, definitions)).toEqual([]);
    expect(coverageMatrix(scoped, definitions, []).every((row) => row.status === "unattempted")).toBe(true);
    expect(
        auditPlan(
            scoped,
            definitions.filter((row) => row.id !== added[0]!.id),
        ).some((row) => row.code === "missing-scenario"),
    ).toBe(true);
});
