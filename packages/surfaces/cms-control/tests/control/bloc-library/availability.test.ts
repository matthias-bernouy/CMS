import { expect, test, spyOn } from "bun:test";
import { saveCollectionAvailability } from "cms-control/core/content/blocLibrary/availability";
import { libraryHarness } from "./fixtures";

test("availability changes one flag without rebuilding artifacts, scanning pages or losing existing editors", async () => {
    const { cms, repository, integrationInstallations } = await libraryHarness();
    await repository.insertPage("/used", "Existing page", "<gallery-card></gallery-card>");
    const before = await repository.getBlocRecord("gallery-card");
    const js = await repository.getBlocsJS();
    const installed = await integrationInstallations.get("gallery");
    const noScan = spyOn(repository, "getAllPages").mockImplementation(() => {
        throw Error("Unexpected page scan");
    });
    const noImport = spyOn(repository, "replaceBloc").mockImplementation(() => {
        throw Error("Unexpected artifact import");
    });
    try {
        const result = await saveCollectionAvailability(cms, "gallery", {
            resource: "gallery/blocs/card",
            active: false,
        });
        expect(result.changed).toEqual(["gallery-card"]);
        expect(await repository.getBlocRecord("gallery-card")).toEqual({
            ...before!,
            artifact: { ...before!.artifact!, catalogue: "inactive" },
        });
        expect(await repository.getBlocsJS()).toEqual(js);
        expect((await repository.getBlocsList()).some((b) => b.id === "gallery-card")).toBe(false);
        expect((await repository.getBlocsList({ includeInactive: true })).some((b) => b.id === "gallery-card")).toBe(
            true,
        );
        const after = await integrationInstallations.get("gallery");
        expect(after).toEqual({
            ...installed!,
            activeResources: ["gallery/blocs/retained"],
            updatedAt: after!.updatedAt,
        });
        await saveCollectionAvailability(cms, "gallery", { resource: "gallery/blocs/card", active: false });
        expect(await integrationInstallations.get("gallery")).toEqual(after);
        expect(noScan).not.toHaveBeenCalled();
        expect(noImport).not.toHaveBeenCalled();
    } finally {
        noScan.mockRestore();
        noImport.mockRestore();
    }
});

test("failed writes compensate prior flags and preserve the installation", async () => {
    const { cms, repository, integrationInstallations } = await libraryHarness();
    const installed = await integrationInstallations.get("gallery");
    const before = await repository.getBlocRecords();
    const write = repository.setBlocCatalogue.bind(repository);
    const setter = spyOn(repository, "setBlocCatalogue").mockImplementation(async (tag, owner, value) => {
        if (tag === "gallery-banner") {
            throw Error("Storage unavailable");
        }
        return write(tag, owner, value);
    });
    try {
        await expect(
            saveCollectionAvailability(cms, "gallery", {
                resources: ["gallery/blocs/banner", "gallery/blocs/retained"],
            }),
        ).rejects.toThrow("Storage unavailable");
        expect(await repository.getBlocRecords()).toEqual(before);
        const after = await integrationInstallations.get("gallery");
        expect(after).toEqual({ ...installed!, updatedAt: after!.updatedAt });
    } finally {
        setter.mockRestore();
    }
});

test("overlapping updates conflict and scalar retry preserves the other switch", async () => {
    const { cms, repository, integrationInstallations } = await libraryHarness();
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const write = repository.setBlocCatalogue.bind(repository);
    const setter = spyOn(repository, "setBlocCatalogue").mockImplementation(async (...args) => {
        entered();
        await gate;
        return write(...args);
    });
    const first = saveCollectionAvailability(cms, "gallery", { resource: "gallery/blocs/card", active: false });
    try {
        await ready;
        await expect(
            saveCollectionAvailability(cms, "gallery", { resource: "gallery/blocs/banner", active: true }),
        ).rejects.toMatchObject({ status: 409 });
        release();
        await first;
        await saveCollectionAvailability(cms, "gallery", { resource: "gallery/blocs/banner", active: true });
        expect((await integrationInstallations.get("gallery"))?.activeResources).toEqual([
            "gallery/blocs/banner",
            "gallery/blocs/retained",
        ]);
    } finally {
        release();
        await first;
        setter.mockRestore();
    }
});

test("activation validates installed dependencies and malformed scalar input before writes", async () => {
    const { cms, definition, integrationInstallations, repository } = await libraryHarness();
    const before = await repository.getBlocRecords();
    for (const body of [
        { resource: "unknown", active: true },
        { resource: "gallery/blocs/card", active: "yes" },
        { active: true },
        { resource: "gallery/blocs/card", active: true, resources: [] },
    ]) {
        await expect(saveCollectionAvailability(cms, "gallery", body)).rejects.toThrow();
    }
    const installed = (await integrationInstallations.get("gallery"))!;
    definition.resources.find((r) => r.id === "gallery/blocs/banner")!.requires = {
        collections: [{ kind: "missing", versionRange: "^1.0.0", resources: [] }],
    };
    await integrationInstallations.replace({ ...installed!, definitionSnapshot: definition });
    await expect(
        saveCollectionAvailability(cms, "gallery", { resource: "gallery/blocs/banner", active: true }),
    ).rejects.toThrow("missing");
    expect(await repository.getBlocRecords()).toEqual(before);
});
