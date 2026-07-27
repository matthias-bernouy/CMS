import { describe, expect, test } from "bun:test";
import {
    BlocOwnershipConflictError,
    BlocRevisionConflictError,
    SiteBlocLifecycleConflictError,
    SiteBlocPublishedSlotConflictError,
} from "@bernouy/cms-content";
import { siteBlocArtifact, siteBlocDefinition, siteBlocSnapshot } from "../blocs/siteBlocFixture";
import { createMongoContentRepository } from "./contentMongoFixture";

describe("MongoCmsRepository site blocs", () => {
    test("migrates legacy flat documents to code-managed aggregates", async () => {
        const { db, repository } = createMongoContentRepository();
        await db.get("blocs").insertOne({
            _id: "legacy-card",
            name: "Legacy card",
            group: "Legacy",
            description: "Pre-ownership document",
            editorJS: "legacy-editor",
            viewJS: "legacy-view",
        });

        await repository.init();

        expect(await repository.getBlocRecord("legacy-card")).toMatchObject({
            tag: "legacy-card",
            ownership: { kind: "code-managed" },
            artifact: { id: "legacy-card", ownership: { kind: "code-managed" } },
        });
        expect(await db.get("blocs").findOne({ _id: "legacy-card" })).toMatchObject({
            ownership: { kind: "code-managed" },
            artifact: { ownership: { kind: "code-managed" } },
        });
    });

    test("enforces ownership during replacements", async () => {
        const { repository } = createMongoContentRepository();
        await repository.createBloc({ ...siteBlocArtifact(), id: "basic-card", ownership: undefined });

        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "basic-card",
                ownership: {
                    kind: "integration",
                    integrationKind: "catalogue",
                    installationId: "installation-1",
                    definitionVersion: "1.0.0",
                },
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
        expect((await repository.getBlocRecord("basic-card"))?.ownership).toEqual({ kind: "code-managed" });
    });

    test("keeps a draft invisible and publishes artifact plus snapshot in one CAS write", async () => {
        const { db, repository } = createMongoContentRepository();
        const definition = siteBlocDefinition();
        await repository.createSiteBloc(definition);
        expect(await repository.getBlocsList()).toEqual([]);
        const collection = db.get("blocs");
        const writesBefore = collection.replaceOneCalls.length;

        const published = await repository.publishSiteBloc(
            "site-feature-panel",
            siteBlocArtifact(),
            1,
            definition.updatedAt,
        );

        expect(collection.replaceOneCalls.length).toBe(writesBefore + 1);
        expect(published.siteDefinition).toMatchObject({
            draftRevision: 1,
            publishedRevision: 1,
            published: published.siteDefinition?.draft,
        });
        expect(published.siteDefinition!.updatedAt.getTime()).toBe(definition.updatedAt.getTime() + 1);
        expect(await repository.getBlocViewJS("site-feature-panel")).toBe("view-artifact");
        await expect(
            repository.publishSiteBloc("site-feature-panel", siteBlocArtifact({ viewJS: "stale-artifact" }), 0),
        ).rejects.toBeInstanceOf(BlocRevisionConflictError);
        expect(await repository.getBlocViewJS("site-feature-panel")).toBe("view-artifact");
    });

    test("preserves the published slot contract in Mongo", async () => {
        const { repository } = createMongoContentRepository();
        await repository.createSiteBloc(siteBlocDefinition());
        await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);

        await expect(
            repository.saveSiteBlocDraft("site-feature-panel", siteBlocSnapshot({ slots: [] }), 1),
        ).rejects.toBeInstanceOf(SiteBlocPublishedSlotConflictError);
        await expect(
            repository.saveSiteBlocDraft(
                "site-feature-panel",
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Body",
                            slot: "renamed-body",
                            accepts: [{ kind: "any-component" }],
                        },
                    ],
                }),
                1,
            ),
        ).rejects.toBeInstanceOf(SiteBlocPublishedSlotConflictError);
        expect((await repository.getBlocRecord("site-feature-panel"))?.siteDefinition?.draftRevision).toBe(1);
    });

    test("archives without deleting publication and restores the definition", async () => {
        const { repository } = createMongoContentRepository();
        await repository.createSiteBloc(siteBlocDefinition());
        await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);
        expect((await repository.archiveSiteBloc("site-feature-panel", 1)).lifecycle).toBe("archived");
        expect(await repository.getBlocViewJS("site-feature-panel")).toBe("view-artifact");
        await expect(repository.saveSiteBlocDraft("site-feature-panel", siteBlocSnapshot(), 1)).rejects.toBeInstanceOf(
            SiteBlocLifecycleConflictError,
        );

        const restored = await repository.restoreSiteBloc("site-feature-panel", 1);
        expect(restored.lifecycle).toBe("active");
        expect(restored.archivedAt).toBeUndefined();
    });
});
