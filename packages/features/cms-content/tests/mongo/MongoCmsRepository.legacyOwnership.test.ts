import { describe, expect, test } from "bun:test";
import { BlocOwnershipConflictError } from "@bernouy/cms-content";
import { siteBlocArtifact } from "../blocs/siteBlocFixture";
import { createMongoContentRepository, type FakeContentCollection } from "./contentMongoFixture";

const integrationOwner = (installationId: string) => ({
    kind: "integration" as const,
    integrationKind: "catalogue",
    installationId,
    definitionVersion: "1.0.0",
});

async function insertOwnerlessLegacy(collection: FakeContentCollection, tag: string) {
    await collection.insertOne({
        _id: tag,
        name: "Legacy card",
        group: "Legacy",
        description: "Pre-ownership document",
        editorJS: "legacy-editor",
        viewJS: "legacy-view",
    });
}

describe("Mongo legacy ownership claims", () => {
    test("marks only ownerless flat documents during migration", async () => {
        const { db, repository } = createMongoContentRepository();
        const collection = db.get("blocs");
        await insertOwnerlessLegacy(collection, "legacy-ownerless");
        await collection.insertOne({
            _id: "legacy-explicit-code",
            name: "Explicit code",
            group: "Legacy",
            description: "Already attributed",
            editorJS: "editor",
            viewJS: "view",
            ownership: { kind: "code-managed" },
        });

        await repository.init();

        expect((await repository.getBlocRecord("legacy-ownerless"))?.legacyOwnershipClaim).toBe("unclaimed");
        expect((await repository.getBlocRecord("legacy-explicit-code"))?.legacyOwnershipClaim).toBeUndefined();
    });

    test("atomically grants an ownerless legacy tag to only one integration", async () => {
        const { db, repository } = createMongoContentRepository();
        await insertOwnerlessLegacy(db.get("blocs"), "legacy-race");
        await repository.init();

        const attempts = await Promise.allSettled(
            ["installation-1", "installation-2"].map((installationId) =>
                repository.replaceBloc({
                    ...siteBlocArtifact(),
                    id: "legacy-race",
                    ownership: integrationOwner(installationId),
                }),
            ),
        );
        const fulfilled = attempts.filter((result) => result.status === "fulfilled");
        const rejected = attempts.filter((result) => result.status === "rejected");
        const record = await repository.getBlocRecord("legacy-race");

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BlocOwnershipConflictError);
        expect(record?.ownership.kind).toBe("integration");
        expect(record?.artifact?.ownership).toEqual(record?.ownership);
        expect(record?.legacyOwnershipClaim).toBeUndefined();
    });

    test("supports a rerun claim before eager migration", async () => {
        const { db, repository } = createMongoContentRepository();
        await insertOwnerlessLegacy(db.get("blocs"), "legacy-direct");

        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-direct",
                ownership: integrationOwner("installation-1"),
            }),
        ).resolves.toMatchObject({ ownership: integrationOwner("installation-1") });
        expect((await repository.getBlocRecord("legacy-direct"))?.legacyOwnershipClaim).toBeUndefined();
    });

    test("lets an explicit code write consume the claim before any integration", async () => {
        const { db, repository } = createMongoContentRepository();
        await insertOwnerlessLegacy(db.get("blocs"), "legacy-code");
        await repository.init();

        await repository.replaceBloc({
            ...siteBlocArtifact(),
            id: "legacy-code",
            ownership: { kind: "code-managed" },
        });

        expect((await repository.getBlocRecord("legacy-code"))?.legacyOwnershipClaim).toBeUndefined();
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-code",
                ownership: integrationOwner("installation-1"),
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
    });

    test("does not expose modern code records or legacy claims to site builders", async () => {
        const { db, repository } = createMongoContentRepository();
        await repository.createBloc({ ...siteBlocArtifact(), id: "modern-code", ownership: undefined });
        await insertOwnerlessLegacy(db.get("blocs"), "legacy-site");
        await repository.init();

        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "modern-code",
                ownership: integrationOwner("installation-1"),
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-site",
                ownership: { kind: "site-builder", definitionId: "definition-1" },
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
        expect((await repository.getBlocRecord("legacy-site"))?.legacyOwnershipClaim).toBe("unclaimed");
    });

    test("normalizes malformed stored ownership without making it claimable", async () => {
        const { db, repository } = createMongoContentRepository();
        const collection = db.get("blocs");
        await collection.insertOne({
            _id: "legacy-malformed-owner",
            name: "Malformed owner",
            group: "Legacy",
            description: "Explicit but invalid ownership",
            editorJS: "editor",
            viewJS: "view",
            ownership: { kind: "unexpected", installationId: "foreign-installation" },
        });

        await repository.init();

        const record = await repository.getBlocRecord("legacy-malformed-owner");
        const stored = await collection.findOne({ _id: "legacy-malformed-owner" });
        expect(record?.ownership).toEqual({ kind: "code-managed" });
        expect(record?.legacyOwnershipClaim).toBeUndefined();
        expect(stored?.ownership).toEqual({ kind: "code-managed" });
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-malformed-owner",
                ownership: integrationOwner("installation-1"),
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
    });
});
