import { describe, expect, test } from "bun:test";

describe("repository public entry points", () => {
    test.each([
        ["@bernouy/ulvia-contracts", "admitContractRelease"],
        ["@bernouy/ulvia-contracts/schema", "parseUlviaSchema"],
        ["@bernouy/ulvia-contracts/bindings", "compileContractBindings"],
        ["@bernouy/ulvia-contracts/compatibility", "compareContractReleases"],
        ["@bernouy/ulvia-contracts/protocol", "parseStrictJson"],
        ["@bernouy/repository/contracts/catalogue", "InMemoryReleaseCatalogue"],
        ["@bernouy/ulvia-providers", "admitProviderManifest"],
        ["@bernouy/ulvia-providers/compatibility", "compareProviderManifests"],
        ["@bernouy/ulvia-providers/installations", "validateProviderInstallation"],
        ["@bernouy/ulvia-providers/selections", "planContractSelections"],
        ["@bernouy/repository/providers/catalogue", "InMemoryProviderManifestCatalogue"],
        ["@bernouy/repository/providers/installations", "ProviderInstallationLifecycle"],
        ["@bernouy/repository/providers/selections", "ContractUpgradeService"],
        ["@bernouy/repository/providers/mongo", "MongoProviderInstallationStore"],
        ["@bernouy/repository/collections", "admitCollectionRelease"],
        ["@bernouy/repository/collections/build", "buildCollectionBloc"],
    ])("loads %s independently through its declared package export", async (specifier, entryPoint) => {
        const module = await import(specifier);
        expect(typeof module[entryPoint]).toBe("function");
    });

    test("keeps the root entry point type-only", async () => {
        expect(Object.keys(await import("@bernouy/repository"))).toEqual([]);
    });

    test("advertises implemented collection surfaces explicitly", async () => {
        const manifest = await Bun.file(new URL("../../package.json", import.meta.url)).json();
        expect(Object.keys(manifest.exports).filter((entry) => entry.startsWith("./collections"))).toEqual([
            "./collections",
            "./collections/build",
            "./collections/installations",
            "./collections/content",
            "./collections/assets",
            "./collections/mongo",
            "./collections/texts",
            "./collections/sources",
            "./collections/http",
        ]);
    });
});
