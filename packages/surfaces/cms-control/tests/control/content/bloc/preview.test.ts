import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { blocPreview } from "cms-control/core/content/bloc/preview/render";
import { seedBloc, seedSiteBloc, siteBlocHarness, siteSnapshot } from "../../site-blocs/fixtures";

describe("read-only bloc previews", () => {
    test("renders installed default content, compositions and only their view dependencies", async () => {
        const { repository, cache } = siteBlocHarness();
        await seedBloc(repository, "example-card", { viewJS: "CARD_VIEW();" });
        await seedBloc(repository, "unrelated-card", { viewJS: "UNRELATED_VIEW();" });
        await seedBloc(repository, "example-composition", {
            compositionHTML: '<section class="installed"><slot></slot></section>',
            source: {
                "manifest.json": btoa(JSON.stringify({ defaultContent: "default.html" })),
                "default.html": btoa(
                    '<example-composition><example-card>Installed default</example-card><img src="/media/{{ item.image }}"><script>UNTRUSTED();</script></example-composition>',
                ),
            },
        });
        const before = await repository.getBlocRecords();
        const response = await blocPreview(repository, "example-composition", "/cms");
        const html = await response.text();
        const document = parseHTML(html).document;

        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
        expect(response.headers.get("content-security-policy")).toContain("form-action 'none'");
        expect(response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
        expect(document.querySelector(".installed example-card")?.textContent).toBe("Installed default");
        expect(document.querySelector("img")?.getAttribute("src")).toBeNull();
        expect(document.querySelector("img")?.getAttribute("data-cms-src")).toBe("/media/{{ item.image }}");
        expect(document.querySelector("[cms-binding-disabled][inert]")).not.toBeNull();
        expect(html).toContain("CARD_VIEW();");
        expect(html).not.toContain("UNRELATED_VIEW();");
        expect(html).not.toContain("UNTRUSTED();");
        expect(html).not.toContain("data-cms-editor-root");
        expect(document.querySelector("script[src]")).toBeNull();
        expect(await repository.getBlocRecords()).toEqual(before);
        expect(cache.deleted).toEqual([]);
    });

    test("renders a site draft before first publication without compiling or persisting it", async () => {
        const { repository } = siteBlocHarness();
        await seedBloc(repository, "example-shell", { compositionHTML: "<article><slot></slot></article>" });
        await seedSiteBloc(
            repository,
            "site-example",
            siteSnapshot({
                structure: [
                    {
                        kind: "bloc",
                        tag: "example-shell",
                        attributes: {},
                        children: [{ kind: "slot", slotId: "body" }],
                    },
                ],
                slots: [{ id: "body", label: "Body", accepts: [{ kind: "any-component" }] }],
                defaultContent: "<p>Authored draft content</p>",
                dependencies: ["example-shell"],
            }),
        );
        const response = await blocPreview(repository, "site-example", "");
        const document = parseHTML(await response.text()).document;

        expect(document.querySelector("article p")?.textContent).toBe("Authored draft content");
        expect((await repository.getBlocRecord("site-example"))?.artifact).toBeNull();
        expect((await repository.getBlocRecord("site-example"))?.siteDefinition?.draftRevision).toBe(1);
    });

    test("returns a private missing-resource response", async () => {
        const { repository } = siteBlocHarness();
        const response = await blocPreview(repository, "missing-bloc", "");
        expect(response.status).toBe(404);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
});
