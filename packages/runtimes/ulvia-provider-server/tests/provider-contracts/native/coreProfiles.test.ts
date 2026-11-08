import { expect, test } from "bun:test";
import type { CollectionRepositorySource } from "@bernouy/repository/collections/sources";
import type { InstanceComposition } from "../../../src/runtime/instances/composition/ProviderInstanceHost";
import { installOfficialCollections } from "../../../src/runtime/instances/instanceInitialization";
import { bundledBootstrapSources } from "../../../src/runtime/instances/profiles/bootstrap";
import {
    bundledOfficialProfiles,
    LazyOfficialProfiles,
} from "../../../src/runtime/instances/profiles/execution/LazyOfficialProfiles";

function forbiddenCollections() {
    let reads = 0;
    const unavailable = async (): Promise<never> => {
        reads++;
        throw new Error("Optional collection resources are unavailable");
    };
    const source: CollectionRepositorySource = {
        id: "absent-starter",
        list: unavailable,
        get: unavailable,
        getMetadata: unavailable,
    };
    return { source, reads: () => reads };
}

test("core profiles discover, resolve and initialize without reading optional collections or content stores", async () => {
    const collections = forbiddenCollections();
    const sources = bundledBootstrapSources();
    let artifactReads = 0;
    const profiles = bundledOfficialProfiles({
        providers: {
            ...sources.providers,
            id: sources.providers.id,
            list: async (kind) => {
                artifactReads++;
                return sources.providers.list(kind);
            },
            get: (entry) => sources.providers.get(entry),
            getAsset: (entry, id, maxBytes) => sources.providers.getAsset!(entry, id, maxBytes),
        },
        collections: collections.source,
    });
    expect(profiles.describe().defaultProfile).toEqual({ id: "ulvia", version: "1.4.0" });
    expect(await profiles.resolve("unknown", "1.0.0")).toBeNull();
    expect(artifactReads).toBe(0);
    for (const id of ["ulvia", "repository"]) {
        const [profile, same] = await Promise.all([profiles.resolve(id, "1.4.0"), profiles.resolve(id, "1.4.0")]);
        expect(profile).toBe(same);
        expect(profile!.collections).toEqual([]);
        expect(profile!.initialPages).toEqual([]);
        expect(profile!.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(
            id === "repository",
        );
        expect(await profiles.contracts(profile!)).toHaveLength(profile!.contracts.length);
        let leaseChecks = 0;
        await installOfficialCollections({} as InstanceComposition, collections.source, profile!, {
            signal: new AbortController().signal,
            throwIfLeaseLost: () => {
                leaseChecks++;
            },
        });
        expect(leaseChecks).toBe(1);
        await expect(
            installOfficialCollections({} as InstanceComposition, collections.source, profile!, {
                signal: AbortSignal.abort(),
                throwIfLeaseLost: () => {
                    throw new Error("Lease lost");
                },
            }),
        ).rejects.toThrow("Lease lost");
    }
    expect(artifactReads).toBe(4);
    expect(collections.reads()).toBe(0);
    await expect(profiles.resolve("ulvia", "1.0.0")).rejects.toThrow("unavailable");
    expect(collections.reads()).toBe(0);
}, 30_000);

test("failed profile loads can retry while unknown references never read artifacts", async () => {
    const reference = { id: "ulvia", version: "1.3.0" };
    let loads = 0;
    const profiles = new LazyOfficialProfiles({ defaultProfile: reference, profiles: [reference] }, async () => {
        loads++;
        return null;
    });
    await expect(profiles.resolve(reference.id, reference.version)).rejects.toThrow("Exact installation profile");
    await expect(profiles.resolve(reference.id, reference.version)).rejects.toThrow("Exact installation profile");
    expect(loads).toBe(2);
    expect(await profiles.resolve(reference.id, "9.0.0")).toBeNull();
    expect(loads).toBe(2);
});
