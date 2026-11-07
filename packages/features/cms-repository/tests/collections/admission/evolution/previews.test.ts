import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { admitCollectionRelease } from "cms-repository/collections/core/admission/admitCollectionRelease";
import { LocalCollectionRepository } from "cms-repository/repository/filesystem/artifacts/collections";
import { expect, test } from "bun:test";
import { parseCollectionRelease } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { verifyCollectionPublicationHistory } from "cms-repository/collections/core/admission/history";
import { collectionDocument, component } from "../../fixtures";
import { collectionFixture } from "../examples/buildFixture";

function release(version: string, extra = false, narrowed = false) {
    const source = collectionDocument();
    source.version = version;
    if (extra) {
        (source.blocs as unknown[]).push({ ...component(), id: "atlas-dofficial--atlas--card" });
    }
    if (narrowed) {
        (source.blocs as Record<string, unknown>[])[0]!.slots = { body: { max: 1 } };
    }
    return parseCollectionRelease(collectionFixture(source));
}

test("collection previews evolve against stable history and do not block stable maintenance", async () => {
    const stable = release("1.0.0");
    const beta1 = release("1.1.0-beta.1");
    const beta2 = release("1.1.0-beta.2", true);
    await expect(verifyCollectionPublicationHistory([stable, beta1], beta2)).resolves.toBeUndefined();
    await expect(verifyCollectionPublicationHistory([stable, beta1, beta2], release("1.0.1"))).resolves.toBeUndefined();
    await expect(
        verifyCollectionPublicationHistory([stable, beta1, beta2], release("1.1.0", true)),
    ).resolves.toBeUndefined();
    await expect(verifyCollectionPublicationHistory([stable, beta2], beta1)).rejects.toThrow("increase within");
    await expect(verifyCollectionPublicationHistory([stable], release("1.1.0-beta.1", false, true))).rejects.toThrow(
        "new resource identity",
    );
    await expect(verifyCollectionPublicationHistory([stable], release("1.0.1-beta.1", true))).rejects.toThrow(
        "implementations only",
    );
});

test("filesystem publication retains stable and beta artifacts and refuses a stale preview without writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "collection-beta-history-"));
    const repository = new LocalCollectionRepository(root);
    try {
        for (const version of ["1.0.0", "1.1.0-beta.2", "1.0.1"]) {
            await repository.store(await admitCollectionRelease(release(version)));
        }
        const before = (await repository.listMetadata()).map((artifact) => artifact.digest);
        await expect(repository.store(await admitCollectionRelease(release("1.1.0-beta.1")))).rejects.toThrow(
            "increase within",
        );
        expect((await repository.listMetadata()).map((artifact) => artifact.digest)).toEqual(before);
        await repository.store(await admitCollectionRelease(release("1.1.0")));
        expect(await repository.listMetadata()).toHaveLength(4);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("a returning stable member cannot recycle its old capability requirements", async () => {
    const withRequirement = (version: string, versionRange: string) => {
        const source = release(version, true);
        return parseCollectionRelease({
            ...source,
            blocs: source.blocs.map((bloc) =>
                bloc.id === "atlas-dofficial--atlas--card"
                    ? {
                          ...bloc,
                          requires: [{ contractId: "ulvia/catalog", capabilityId: "items.list", versionRange }],
                      }
                    : bloc,
            ),
        });
    };
    const stable = withRequirement("1.0.0", "^1.0.0");
    const retired = release("2.0.0");
    await expect(verifyCollectionPublicationHistory([stable], retired)).resolves.toBeUndefined();
    await expect(
        verifyCollectionPublicationHistory([stable, retired], withRequirement("3.0.0-beta.1", "^2.0.0")),
    ).rejects.toThrow("stable resource requirements");
});
