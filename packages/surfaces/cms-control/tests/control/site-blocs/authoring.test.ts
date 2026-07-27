import { describe, expect, test } from "bun:test";
import { DuplicateBlocTagError, SiteBlocLifecycleConflictError } from "@bernouy/cms-content";
import postSiteBloc from "cms-control/api/_content/site-bloc/site-bloc.post";
import putSiteBloc from "cms-control/api/_content/site-bloc/site-bloc.put";
import patchSiteBloc from "cms-control/api/_content/site-bloc/site-bloc.patch";
import { jsonRequest, seedBloc, seedPublishedSiteBloc, siteBlocHarness, siteSnapshot } from "./fixtures";

describe("site bloc authoring endpoints", () => {
    test("creates a normalized draft and saves editor HTML as a structured revision", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "basic-section");
        await seedBloc(repository, "basic-card");
        const createdResponse = await postSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc", "POST", {
                tag: "SITE-Feature",
                name: "Feature",
                group: "Editorial",
                description: "Editable composition",
            }),
            cms,
        );
        const created = await createdResponse.json();

        expect(createdResponse.status).toBe(201);
        expect(created).toMatchObject({
            schema: "cms.site-bloc.v1",
            tag: "site-feature",
            lifecycle: "active",
            draftRevision: 1,
            publishedRevision: null,
            draft: { name: "Feature", group: "Editorial", structure: [], slots: [] },
        });
        expect(await repository.getBlocViewJS("site-feature")).toBeNull();

        const structureHtml = `<basic-section tone="soft">
            <cms-site-slot-placeholder
                data-slot-id="cards"
                data-slot-label="Cards"
                data-slot-name="cards"
                data-slot-kind="components"
                data-slot-tags="basic-card"
                data-slot-min="1"
                data-slot-max="2"></cms-site-slot-placeholder>
        </basic-section>`;
        const savedResponse = await putSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc?id=site-feature", "PUT", {
                expectedDraftRevision: 1,
                name: "Feature grid",
                group: "Editorial",
                description: "Updated composition",
                structureHtml,
                defaultContent: `<basic-card slot="cards"></basic-card><script>unsafe()</script>`,
            }),
            cms,
        );
        const saved = await savedResponse.json();

        expect(saved.draftRevision).toBe(2);
        expect(saved.draft).toMatchObject({
            name: "Feature grid",
            dependencies: ["basic-section"],
            structure: [
                {
                    kind: "bloc",
                    tag: "basic-section",
                    attributes: { tone: "soft" },
                    children: [{ kind: "slot", slotId: "cards" }],
                },
            ],
            slots: [
                {
                    id: "cards",
                    label: "Cards",
                    slot: "cards",
                    min: 1,
                    max: 2,
                    accepts: [{ kind: "component", tag: "basic-card" }],
                },
            ],
            defaultContent: `<basic-card slot="cards"></basic-card>`,
        });
    });

    test("rejects global tag collisions for both code and site owners", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "site-existing");
        const request = () =>
            jsonRequest("http://localhost/cms/api/site-bloc", "POST", {
                tag: "site-existing",
                name: "Existing",
            });

        await expect(postSiteBloc(request(), cms)).rejects.toBeInstanceOf(DuplicateBlocTagError);
        await postSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc", "POST", { tag: "site-new", name: "New" }),
            cms,
        );
        await expect(
            postSiteBloc(
                jsonRequest("http://localhost/cms/api/site-bloc", "POST", { tag: "site-new", name: "Again" }),
                cms,
            ),
        ).rejects.toBeInstanceOf(DuplicateBlocTagError);
    });

    test("archives and restores through PATCH while keeping the live artifact", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedPublishedSiteBloc(repository, "site-archivable", siteSnapshot({ name: "Archivable" }));

        const archivedResponse = await patchSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc?id=site-archivable", "PATCH", {
                archived: true,
                expectedDraftRevision: 1,
            }),
            cms,
        );
        expect(await archivedResponse.json()).toMatchObject({ lifecycle: "archived", archivedAt: expect.any(String) });
        expect(await repository.getBlocViewJS("site-archivable")).not.toBeNull();
        await expect(
            putSiteBloc(
                jsonRequest("http://localhost/cms/api/site-bloc?id=site-archivable", "PUT", {
                    expectedDraftRevision: 1,
                    snapshot: siteSnapshot(),
                }),
                cms,
            ),
        ).rejects.toBeInstanceOf(SiteBlocLifecycleConflictError);

        const restoredResponse = await patchSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc?id=site-archivable", "PATCH", {
                archived: false,
                expectedDraftRevision: 1,
            }),
            cms,
        );
        const restored = await restoredResponse.json();
        expect(restored.lifecycle).toBe("active");
        expect(restored.archivedAt).toBeUndefined();
    });
});
