import { describe, expect, test } from "bun:test";
import { ContentValidationError } from "@bernouy/cms-content";
import { saveSiteBloc } from "cms-control/core/content/siteBloc/service";
import { seedBloc, seedPublishedSiteBloc, seedSiteBloc, siteBlocHarness, siteSnapshot } from "./fixtures";

function saveInput(snapshot: ReturnType<typeof siteSnapshot>, expectedDraftRevision = 1) {
    return {
        expectedDraftRevision,
        name: snapshot.name,
        group: snapshot.group,
        description: snapshot.description,
        defaultContent: snapshot.defaultContent,
        snapshot,
    };
}

function contentSnapshot(defaultContent: string, overrides: Partial<ReturnType<typeof siteSnapshot>> = {}) {
    return siteSnapshot({
        structure: [{ kind: "slot", slotId: "body" }],
        slots: [
            {
                id: "body",
                label: "Body",
                min: 1,
                max: 1,
                accepts: [{ kind: "component", tag: "basic-card" }],
            },
        ],
        defaultContent,
        ...overrides,
    });
}

describe("site bloc draft validation", () => {
    test("rejects direct self-reference", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedSiteBloc(repository, "site-self");
        const snapshot = siteSnapshot({
            structure: [{ kind: "bloc", tag: "site-self", attributes: {}, children: [] }],
        });

        await expect(saveSiteBloc(cms, "site-self", saveInput(snapshot))).rejects.toThrow(/cannot reference itself/);
    });

    test("rejects a transitive dependency cycle against published blocs", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedPublishedSiteBloc(repository, "site-cycle");
        await seedBloc(repository, "cycle-parent", {
            viewJS: `const template = "<site-cycle></site-cycle>";`,
        });
        const snapshot = siteSnapshot({
            structure: [{ kind: "bloc", tag: "cycle-parent", attributes: {}, children: [] }],
        });

        await expect(saveSiteBloc(cms, "site-cycle", saveInput(snapshot))).rejects.toThrow(
            /site-cycle -> cycle-parent -> site-cycle/,
        );
    });

    test("enforces accepts and min/max against default content", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "basic-card");
        await seedBloc(repository, "other-card");
        await seedSiteBloc(repository, "site-defaults");

        await expect(saveSiteBloc(cms, "site-defaults", saveInput(contentSnapshot("")))).rejects.toThrow(
            /requires at least 1/,
        );
        await expect(
            saveSiteBloc(cms, "site-defaults", saveInput(contentSnapshot("<other-card></other-card>"))),
        ).rejects.toThrow(/is not accepted/);
        await expect(
            saveSiteBloc(
                cms,
                "site-defaults",
                saveInput(contentSnapshot("<basic-card></basic-card><basic-card></basic-card>")),
            ),
        ).rejects.toThrow(/accepts at most 1/);

        const saved = await saveSiteBloc(
            cms,
            "site-defaults",
            saveInput(contentSnapshot("<basic-card></basic-card><script>unsafe()</script>")),
        );
        expect(saved.draft.defaultContent).toBe("<basic-card></basic-card>");
        expect(saved.draftRevision).toBe(2);
    });

    test("rejects unknown accepted component tags", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedSiteBloc(repository, "site-accepts");
        const snapshot = contentSnapshot("", {
            slots: [
                {
                    id: "body",
                    label: "Body",
                    accepts: [{ kind: "component", tag: "missing-card" }],
                },
            ],
        });

        await expect(saveSiteBloc(cms, "site-accepts", saveInput(snapshot))).rejects.toThrow(
            /missing-card.*not published/,
        );
    });

    test("rejects private binding tags and attributes before persistence", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "basic-card");
        await seedBloc(repository, "cms-binding-core");
        await seedSiteBloc(repository, "site-private-binding");
        const withAttribute = siteSnapshot({
            structure: [
                {
                    kind: "bloc",
                    tag: "basic-card",
                    attributes: { "cms-source": "/api/private" },
                    children: [],
                },
            ],
        });
        const withBindingCore = siteSnapshot({
            structure: [{ kind: "bloc", tag: "cms-binding-core", attributes: {}, children: [] }],
        });

        await expect(saveSiteBloc(cms, "site-private-binding", saveInput(withAttribute))).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        await expect(saveSiteBloc(cms, "site-private-binding", saveInput(withBindingCore))).rejects.toBeInstanceOf(
            ContentValidationError,
        );
        expect((await repository.getBlocRecord("site-private-binding"))?.siteDefinition?.draftRevision).toBe(1);
    });

    test("hardens the private structure before persisting it", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "basic-card");
        await seedSiteBloc(repository, "site-hardened");

        const saved = await saveSiteBloc(cms, "site-hardened", {
            expectedDraftRevision: 1,
            name: "Hardened",
            group: "Site",
            description: "Sanitized private structure",
            defaultContent: "",
            structureHtml:
                '<basic-card href="javascript:alert(1)" onclick="alert(2)"></basic-card><script>alert(3)</script>',
        });

        expect(saved.draft.structure).toEqual([{ kind: "bloc", tag: "basic-card", attributes: {}, children: [] }]);
    });
});
