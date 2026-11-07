import { expect, test } from "bun:test";
import { admitCollectionRelease } from "cms-repository/collections/core/admission/admitCollectionRelease";
import { collectionExampleDocument } from "cms-repository/collections/core/validation/examples/document";
import { parseCollectionRelease } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { verifyCollectionPublicationEvolution } from "cms-repository/collections/core/admission/evolution";
import { DEFAULT_COLLECTION_LIMITS } from "cms-repository/collections/core/limits";
import { bootstrapCollection, includedRecipe } from "./fixture";

test("bootstrap recipes remain immutable initialization data without modifying their source examples", async () => {
    const source = bootstrapCollection();
    source.bootstraps[0].includes.push(includedRecipe());
    const before = JSON.stringify(source);
    const artifact = await admitCollectionRelease(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(Object.isFrozen(source.bootstraps)).toBe(false);
    expect(Object.isFrozen(artifact.release.bootstraps)).toBe(true);
    const ordinary = structuredClone(source);
    delete ordinary.bootstraps;
    const without = await admitCollectionRelease(ordinary);
    expect(Object.hasOwn(without.release, "bootstraps")).toBe(false);
    expect(artifact.digest).not.toBe(without.digest);
    expect(collectionExampleDocument(artifact.release, "assembled")).toEqual(
        collectionExampleDocument(without.release, "assembled"),
    );
});

test.each([
    "/.cms/mcp",
    "/assets",
    "/api/test",
    "/readyz",
    "/healthz",
    "/admin/../login",
    "https://other.test/",
    "/admin?x=1",
])("rejects reserved or noncanonical proposed Page path %s", (path) => {
    const source = bootstrapCollection();
    source.bootstraps[0].pages[0].path = path;
    expect(() => parseCollectionRelease(source)).toThrow("ordinary Page path");
});

test("recipes reject code, missing examples, invalid text references and duplicate Page ownership", () => {
    for (const mutate of [
        (s: any) => {
            s.bootstraps[0].script = "process.exit()";
        },
        (s: any) => {
            s.bootstraps[0].pages[0].exampleId = "missing";
        },
        (s: any) => {
            s.bootstraps[0].label = "missing.translation";
        },
        (s: any) => {
            s.bootstraps[0].pages[0].visible = "true";
        },
        (s: any) => {
            delete s.bootstraps[0].pages[0].indexing;
        },
        (s: any) => {
            s.bootstraps[0].pages.push({ ...s.bootstraps[0].pages[0], id: "other" });
        },
        (s: any) => {
            s.bootstraps[0].pages.push({ ...s.bootstraps[0].pages[0], path: "/other" });
        },
        (s: any) => {
            s.translations["en-US"]["bootstrap.page-title"] = "x".repeat(71);
        },
        (s: any) => {
            s.bootstraps[0].pages[0].content = "<script>run()</script>";
        },
        (s: any) => {
            s.bootstraps[0].pages[0].systemRole = "administrator";
        },
    ]) {
        const source = bootstrapCollection();
        mutate(source);
        expect(() => parseCollectionRelease(source)).toThrow();
    }
});

test("includes require exact external coordinates and bounded unique omissions", () => {
    for (const change of [
        { version: "^1.0.0" },
        { digest: "latest" },
        { publisherId: "other" },
        { collectionId: "atlas.official/atlas", publisherId: "atlas.official" },
        { omitPages: ["login", "login"] },
        { url: "https://other.test" },
    ]) {
        const source = bootstrapCollection();
        source.bootstraps[0].includes = [{ ...includedRecipe(), ...change }];
        expect(() => parseCollectionRelease(source)).toThrow();
    }
});

test("bootstrap changes require an explicit minor release while live resource contracts remain compatible", async () => {
    const initial = parseCollectionRelease(bootstrapCollection());
    const next = bootstrapCollection();
    next.version = "1.0.1";
    next.bootstraps[0].pages[0].path = "/administration";
    await expect(verifyCollectionPublicationEvolution(initial, parseCollectionRelease(next))).rejects.toThrow(
        "minor publication",
    );
    next.version = "1.1.0";
    await expect(verifyCollectionPublicationEvolution(initial, parseCollectionRelease(next))).resolves.toBeUndefined();
});

test("recipe count and aggregate Page budgets are enforced before any initialization", () => {
    const source = bootstrapCollection();
    source.bootstraps.push({ ...source.bootstraps[0], id: "alternative" });
    expect(() => parseCollectionRelease(source, { ...DEFAULT_COLLECTION_LIMITS, maxBootstraps: 1 })).toThrow(
        "at most 1",
    );
    expect(() => parseCollectionRelease(source, { ...DEFAULT_COLLECTION_LIMITS, maxBootstrapPages: 1 })).toThrow(
        "aggregate bootstrap",
    );
});
