import { describe, expect, test } from "bun:test";
import {
    BlocOwnershipConflictError,
    BlocRevisionConflictError,
    InMemoryCmsRepository,
    SiteBlocLifecycleConflictError,
    SiteBlocNotFoundError,
    SiteBlocPublicationRequiredError,
    SiteBlocPublishedSlotConflictError,
    ValidatingCmsRepository,
} from "@bernouy/cms-content";
import { siteBlocArtifact, siteBlocDefinition, siteBlocSnapshot } from "./siteBlocFixture";

describe("InMemoryCmsRepository site blocs", () => {
    test("normalizes legacy writes and enforces one owner per tag", async () => {
        const repository = new InMemoryCmsRepository();
        const legacy = { ...siteBlocArtifact(), id: "basic-card", ownership: undefined };

        expect((await repository.createBloc(legacy)).ownership).toEqual({ kind: "code-managed" });
        await expect(
            repository.replaceBloc({
                ...legacy,
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

    test("allows integration upgrades only for the same installation", async () => {
        const repository = new InMemoryCmsRepository();
        const ownership = {
            kind: "integration" as const,
            integrationKind: "catalogue",
            installationId: "installation-1",
            definitionVersion: "1.0.0",
        };
        await repository.createBloc({ ...siteBlocArtifact(), id: "catalogue-grid", ownership });

        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "catalogue-grid",
                ownership: { ...ownership, definitionVersion: "1.1.0" },
            }),
        ).resolves.toMatchObject({ ownership: { definitionVersion: "1.1.0" } });
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "catalogue-grid",
                ownership: { ...ownership, installationId: "installation-2" },
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
    });

    test("keeps drafts out of runtime reads and publishes with revision CAS", async () => {
        const inner = new InMemoryCmsRepository();
        const repository = new ValidatingCmsRepository(inner);
        await repository.createSiteBloc(siteBlocDefinition());

        expect(await repository.getBlocsList()).toEqual([]);
        expect(await repository.getBlocViewJS("site-feature-panel")).toBeNull();
        const published = await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);
        expect(published.siteDefinition?.publishedRevision).toBe(1);
        expect(published.siteDefinition?.published).toEqual(published.siteDefinition?.draft);
        expect(published.siteDefinition!.updatedAt.getTime()).toBeGreaterThan(siteBlocDefinition().updatedAt.getTime());
        expect(await repository.getBlocViewJS("site-feature-panel")).toBe("view-artifact");

        await expect(
            repository.publishSiteBloc("site-feature-panel", siteBlocArtifact({ viewJS: "stale-artifact" }), 0),
        ).rejects.toBeInstanceOf(BlocRevisionConflictError);
        expect(await repository.getBlocViewJS("site-feature-panel")).toBe("view-artifact");
        await expect(repository.replaceBloc(siteBlocArtifact())).rejects.toBeInstanceOf(
            SiteBlocPublicationRequiredError,
        );
    });

    test("preserves published slot ids and public names while allowing metadata changes", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.createSiteBloc(siteBlocDefinition());
        await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);

        const updated = siteBlocSnapshot({
            slots: [
                {
                    id: "body",
                    label: "Updated label",
                    min: 1,
                    max: 4,
                    accepts: [{ kind: "component", tag: "basic-card" }],
                },
            ],
        });
        expect((await repository.saveSiteBlocDraft("site-feature-panel", updated, 1)).draftRevision).toBe(2);
        await expect(
            repository.saveSiteBlocDraft("site-feature-panel", siteBlocSnapshot({ slots: [] }), 2),
        ).rejects.toBeInstanceOf(SiteBlocPublishedSlotConflictError);
        await expect(
            repository.saveSiteBlocDraft(
                "site-feature-panel",
                siteBlocSnapshot({
                    slots: [
                        {
                            id: "body",
                            label: "Content",
                            slot: "renamed",
                            accepts: [{ kind: "any-component" }],
                        },
                    ],
                }),
                2,
            ),
        ).rejects.toBeInstanceOf(SiteBlocPublishedSlotConflictError);
        expect((await repository.getBlocRecord("site-feature-panel"))?.siteDefinition?.draftRevision).toBe(2);

        const namedRepository = new InMemoryCmsRepository();
        const namedSnapshot = siteBlocSnapshot({
            slots: [
                {
                    id: "body",
                    label: "Body",
                    slot: "body",
                    accepts: [{ kind: "any-component" }],
                },
            ],
        });
        await namedRepository.createSiteBloc(siteBlocDefinition({ draft: namedSnapshot }));
        await namedRepository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);
        await expect(
            namedRepository.saveSiteBlocDraft("site-feature-panel", siteBlocSnapshot(), 1),
        ).rejects.toBeInstanceOf(SiteBlocPublishedSlotConflictError);
    });

    test("archives without withdrawing the publication and restores authoring", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.createSiteBloc(siteBlocDefinition());
        await repository.publishSiteBloc("site-feature-panel", siteBlocArtifact(), 1);

        const archived = await repository.archiveSiteBloc("site-feature-panel", 1);
        expect(archived.lifecycle).toBe("archived");
        expect(await repository.getBlocViewJS("site-feature-panel")).toBe("view-artifact");
        await expect(repository.saveSiteBlocDraft("site-feature-panel", siteBlocSnapshot(), 1)).rejects.toBeInstanceOf(
            SiteBlocLifecycleConflictError,
        );

        const restored = await repository.restoreSiteBloc("site-feature-panel", 1);
        expect(restored.lifecycle).toBe("active");
        expect(restored.archivedAt).toBeUndefined();
        await expect(repository.saveSiteBlocDraft("site-feature-panel", siteBlocSnapshot(), 1)).resolves.toMatchObject({
            draftRevision: 2,
        });
        await expect(repository.archiveSiteBloc("site-missing", 1)).rejects.toBeInstanceOf(SiteBlocNotFoundError);
    });
});
