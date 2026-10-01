import { describe, expect, test } from "bun:test";

describe("repository public entry points", () => {
    test.each([
        ["contracts", "admitContractRelease"],
        ["contracts/schema", "parseUlviaSchema"],
        ["contracts/bindings", "compileContractBindings"],
        ["contracts/compatibility", "compareContractReleases"],
        ["contracts/catalogue", "InMemoryReleaseCatalogue"],
        ["contracts/protocol", "parseStrictJson"],
        ["providers", "admitProviderManifest"],
        ["providers/catalogue", "InMemoryProviderManifestCatalogue"],
        ["providers/compatibility", "compareProviderManifests"],
        ["providers/installations", "validateProviderInstallation"],
        ["providers/selections", "planContractSelections"],
        ["providers/mongo", "MongoProviderInstallationStore"],
        ["collections", "admitCollectionRelease"],
    ])("loads %s independently through its declared package export", async (subpath, entryPoint) => {
        const module = await import(`@bernouy/cms-repository/${subpath}`);
        expect(typeof module[entryPoint]).toBe("function");
    });

    test("keeps the root entry point type-only", async () => {
        expect(Object.keys(await import("@bernouy/cms-repository"))).toEqual([]);
    });

    test("advertises implemented collection surfaces explicitly", async () => {
        const manifest = await Bun.file(new URL("../../package.json", import.meta.url)).json();
        expect(Object.keys(manifest.exports).filter((entry) => entry.startsWith("./collections"))).toEqual([
            "./collections",
            "./collections/installations",
            "./collections/mongo",
            "./collections/texts",
            "./collections/sources",
            "./collections/http",
        ]);
    });
});
