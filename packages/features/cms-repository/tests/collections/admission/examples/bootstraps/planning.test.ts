import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { planCollectionInitialization } from "@bernouy/cms-repository/collections/installations";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, resolveContract } from "@bernouy/cms-repository/contracts/catalogue";
import { bootstrapCollection } from "./fixture";
import { DEFAULT_INITIALIZATION_LIMITS } from "../../../../../src/collections/installations/initialization/limits";

const reference = (entry: Awaited<ReturnType<typeof admitCollectionRelease>>, bootstrapId = "admin") => ({
    publisherId: entry.release.publisherId,
    collectionId: entry.release.collectionId,
    version: entry.release.version,
    digest: entry.digest,
    bootstrapId,
});

test("empty initialization is explicit, deterministic and needs no collection", async () => {
    const a = await planCollectionInitialization(null, [], { selected: [] });
    expect(a.root).toBeNull();
    expect(a.pages).toEqual([]);
    expect(a.collections).toEqual([]);
    expect(a.digest).toBe((await planCollectionInitialization(null, [], { selected: [] })).digest);
    expect(Object.isFrozen(a)).toBe(true);
});

test("initialization copies translated example metadata without mutating source or creating live Pages", async () => {
    const artifact = await admitCollectionRelease(bootstrapCollection());
    const before = structuredClone(artifact.release);
    const plan = await planCollectionInitialization(reference(artifact), [artifact], { selected: [], locale: "fr" });
    expect(plan.collections.map(({ collectionId }) => collectionId)).toEqual([artifact.release.collectionId]);
    expect(plan.pages[0]).toMatchObject({
        path: "/admin",
        exampleId: "assembled",
        title: "Administration",
        visible: true,
    });
    expect(plan.pages[0]!.receiptId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifact.release).toEqual(before);
    expect(
        (await planCollectionInitialization(reference(artifact), [artifact], { selected: [], locale: "en" })).digest,
    ).not.toBe(plan.digest);
});

test("missing, substituted, ambiguous and oversized initialization inputs refuse before execution", async () => {
    const artifact = await admitCollectionRelease(bootstrapCollection());
    await expect(planCollectionInitialization(reference(artifact), [], { selected: [] })).rejects.toThrow(
        "unavailable",
    );
    await expect(
        planCollectionInitialization({ ...reference(artifact), digest: `sha256:${"0".repeat(64)}` }, [artifact], {
            selected: [],
        }),
    ).rejects.toThrow("unavailable");
    await expect(
        planCollectionInitialization({ ...reference(artifact), url: "https://other.test" }, [artifact], {
            selected: [],
        }),
    ).rejects.toThrow();
    await expect(
        planCollectionInitialization(reference(artifact), [artifact, artifact], { selected: [] }),
    ).rejects.toThrow("duplicate");
    await expect(planCollectionInitialization(null, [artifact], { selected: [] })).rejects.toThrow(
        "empty initialization",
    );
    await expect(
        planCollectionInitialization(reference(artifact), [artifact], {
            selected: [],
            limits: { ...DEFAULT_INITIALIZATION_LIMITS, maxMetadataBytes: 1 },
        }),
    ).rejects.toThrow("byte limit");
    await expect(
        planCollectionInitialization(reference(artifact), [artifact], { selected: [], signal: AbortSignal.abort() }),
    ).rejects.toThrow();
});

test("includes use exact releases, scoped omissions and reject combined route conflicts", async () => {
    const source = bootstrapCollection();
    source.bootstraps.push({ ...structuredClone(source.bootstraps[0]), id: "second" });
    const child = await admitCollectionRelease(source);
    const parentSource: any = {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "atlas.official/start",
        publisherId: "atlas.official",
        version: "1.0.0",
        name: "name",
        locale: "en",
        translations: { en: { name: "Start", description: "Start here" } },
        assets: [],
        blocs: [],
        bootstraps: [
            {
                id: "admin",
                label: "name",
                description: "description",
                requires: [],
                pages: [],
                includes: [{ ...reference(child), omitPages: ["home"] }, reference(child, "second")],
            },
        ],
    };
    const parent = await admitCollectionRelease(parentSource);
    const plan = await planCollectionInitialization(reference(parent), [parent, child], { selected: [] });
    expect(plan.pages).toHaveLength(1);
    expect(plan.collections).toHaveLength(2);
    parentSource.bootstraps[0].includes[0] = reference(child);
    const conflict = await admitCollectionRelease(parentSource);
    await expect(
        planCollectionInitialization(reference(conflict), [conflict, child], { selected: [] }),
    ).rejects.toThrow("path conflict");
    parentSource.bootstraps[0].includes[0] = { ...reference(child), omitPages: ["absent"] };
    const missing = await admitCollectionRelease(parentSource);
    await expect(planCollectionInitialization(reference(missing), [missing, child], { selected: [] })).rejects.toThrow(
        "omitted Page",
    );
});

test("a recipe cannot manufacture support from an unselected compatible contract release", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    const selected = [];
    for (const version of ["1.0.0", "2.0.0"]) {
        const admission = await admitContractRelease({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: "ulvia/catalog",
            publisherId: "ulvia",
            name: "Catalog",
            version,
            capabilities: [
                {
                    id: "items.list",
                    access: "admin",
                    behavior: { effect: "query", execution: "sync", sensitive: false },
                    input: { type: "object", properties: {}, required: [] },
                    output: { type: "null" },
                    errors: [],
                    bindings: [{ id: "mcp", transport: "mcp" }],
                },
            ],
        });
        await catalogue.publish(admission);
        selected.push(await resolveContract(catalogue, admission));
    }
    const source = bootstrapCollection();
    source.bootstraps[0].requires = [
        { contractId: "ulvia/catalog", capabilityId: "items.list", versionRange: "^2.0.0" },
    ];
    const artifact = await admitCollectionRelease(source, [], { contracts: catalogue });
    await expect(
        planCollectionInitialization(reference(artifact), [artifact], { selected: [selected[0]!] }),
    ).rejects.toThrow("selected execution");
    expect(
        (await planCollectionInitialization(reference(artifact), [artifact], { selected: [selected[1]!] }))
            .contracts[0]!.version,
    ).toBe("2.0.0");
});
