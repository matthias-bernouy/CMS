import { describe, expect, test } from "bun:test";
import publishSiteBloc from "cms-control/api/_content/site-bloc/publish.post";
import putSiteBloc from "cms-control/api/_content/site-bloc/site-bloc.put";
import { jsonRequest, seedBloc, seedSiteBloc, siteBlocHarness, siteSnapshot } from "../fixtures";

describe("site bloc snapshot hardening", () => {
    test("removes a forged javascript URL before persistence and publication", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedBloc(repository, "a");
        await seedSiteBloc(repository, "site-safe-link");
        const snapshot = siteSnapshot({
            structure: [
                {
                    kind: "bloc",
                    tag: "a",
                    attributes: { href: "javascript:alert(1)", title: "Safe link" },
                    children: [],
                },
            ],
        });

        await putSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc?id=site-safe-link", "PUT", {
                expectedDraftRevision: 1,
                snapshot,
            }),
            cms,
        );
        const saved = await repository.getBlocRecord("site-safe-link");
        expect(saved?.siteDefinition?.draft.structure).toEqual([
            {
                kind: "bloc",
                tag: "a",
                attributes: { title: "Safe link" },
                children: [],
            },
        ]);

        await publishSiteBloc(
            jsonRequest("http://localhost/cms/api/site-bloc/publish?id=site-safe-link", "POST", {
                expectedDraftRevision: 2,
            }),
            cms,
        );
        const published = await repository.getBlocRecord("site-safe-link");
        expect(published?.siteDefinition?.published).toEqual(published?.siteDefinition?.draft);
        const template = Buffer.from(published!.artifact!.source!["template.html"]!, "base64").toString("utf-8");
        expect(template).toContain('title="Safe link"');
        expect(template).not.toContain("javascript:");
    });
});
