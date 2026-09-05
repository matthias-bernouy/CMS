import { describe, expect, test } from "bun:test";
import putSiteBloc from "cms-control/api/_content/site-bloc/site-bloc.put";
import { jsonRequest, seedSiteBloc, siteBlocHarness, siteSnapshot } from "../fixtures";

describe("site bloc native link validation", () => {
    test("rejects forged javascript URLs in snapshot and editor HTML inputs", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedSiteBloc(repository, "site-safe-link");
        const snapshot = siteSnapshot({
            structure: [
                {
                    kind: "bloc",
                    tag: "a",
                    attributes: { href: "javascript:alert(1)" },
                    children: [],
                },
            ],
        });

        await expect(
            putSiteBloc(
                jsonRequest("http://localhost/cms/api/site-bloc?id=site-safe-link", "PUT", {
                    expectedDraftRevision: 1,
                    snapshot,
                }),
                cms,
            ),
        ).rejects.toThrow(/forbidden URL scheme/);

        await expect(
            putSiteBloc(
                jsonRequest("http://localhost/cms/api/site-bloc?id=site-safe-link", "PUT", {
                    expectedDraftRevision: 1,
                    name: "Unsafe link",
                    group: "Site",
                    description: "Unsafe link",
                    defaultContent: "",
                    structureHtml: '<a href="java&#x0A;script:alert(1)">Link</a>',
                }),
                cms,
            ),
        ).rejects.toThrow(/forbidden URL scheme/);

        const saved = await repository.getBlocRecord("site-safe-link");
        expect(saved?.siteDefinition?.draftRevision).toBe(1);
        expect(saved?.siteDefinition?.draft.structure).toEqual([]);
    });
});
