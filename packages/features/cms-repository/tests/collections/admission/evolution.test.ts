import { collectionFixture } from "./examples/buildFixture";
import { expect, test } from "bun:test";
import { parseCollectionRelease, verifyCollectionPublicationEvolution } from "../../../src/exports/collections";
import { collectionDocument, component } from "../fixtures";

function release(version: string, update: (source: Record<string, unknown>) => void = () => {}) {
    const source = collectionDocument();
    source.version = version;
    update(source);
    return parseCollectionRelease(collectionFixture(source));
}

test("collection publication separates implementation, compatible contract and breaking changes", async () => {
    const initial = release("1.0.0");
    const implementation = release("1.0.1", (source) => {
        (source.blocs as Record<string, unknown>[])[0]!.style = ":scope { display: grid; }";
    });
    await expect(verifyCollectionPublicationEvolution(initial, implementation)).resolves.toBeUndefined();

    const patchContract = release("1.0.1", (source) => {
        (source.blocs as Record<string, unknown>[]).push({ ...component(), id: "atlas-card" });
    });
    await expect(verifyCollectionPublicationEvolution(initial, patchContract)).rejects.toThrow("implementations only");

    const minorContract = release("1.1.0", (source) => {
        (source.blocs as Record<string, unknown>[]).push({ ...component(), id: "atlas-card" });
    });
    await expect(verifyCollectionPublicationEvolution(initial, minorContract)).resolves.toBeUndefined();
});

test("retained incompatible resources require new identities even in a major release", async () => {
    const initial = release("1.0.0");
    for (const version of ["1.1.0", "2.0.0"]) {
        const incompatible = release(version, (source) => {
            (source.blocs as Record<string, unknown>[])[0]!.slots = { body: { max: 1 } };
        });
        await expect(verifyCollectionPublicationEvolution(initial, incompatible)).rejects.toThrow(
            "new resource identity",
        );
    }
    const removed = release("2.0.0", (source) => {
        source.blocs = [];
        source.examples = [];
    });
    await expect(verifyCollectionPublicationEvolution(initial, removed)).resolves.toBeUndefined();
    const minorRemoved = release("1.1.0", (source) => {
        source.blocs = [];
        source.examples = [];
    });
    await expect(verifyCollectionPublicationEvolution(initial, minorRemoved)).rejects.toThrow("major publication");
});

test("retained resource requirements cannot narrow and publication identity is stable", async () => {
    const requirement = { contractId: "catalog.items", capabilityId: "item.list", versionRange: "^1.0.0" };
    const initial = release("1.0.0", (source) => {
        (source.blocs as Record<string, unknown>[])[0]!.requires = [requirement];
    });
    const narrowed = release("2.0.0", (source) => {
        (source.blocs as Record<string, unknown>[])[0]!.requires = [{ ...requirement, versionRange: ">=1.2.0 <2.0.0" }];
    });
    await expect(verifyCollectionPublicationEvolution(initial, narrowed)).rejects.toThrow("new resource identity");
    await expect(verifyCollectionPublicationEvolution(initial, initial)).rejects.toThrow("version must increase");
});
