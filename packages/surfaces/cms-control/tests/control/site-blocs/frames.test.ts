import { describe, expect, test } from "bun:test";
import { BlocRevisionConflictError, ContentValidationError } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import getSiteBlocFrame from "cms-control/api/_content/site-bloc/frame.get";
import getDependencyScript from "cms-control/api/_content/site-bloc/runtime/dependencies.js.get";
import getDraftScript from "cms-control/api/_content/site-bloc/runtime/draft.js.get";
import { seedBloc, seedPublishedSiteBloc, siteBlocHarness, siteSnapshot } from "./fixtures";

function frameSnapshot() {
    return siteSnapshot({
        name: "Framed composition",
        structure: [
            {
                kind: "bloc",
                tag: "basic-section",
                attributes: { tone: "soft" },
                children: [{ kind: "slot", slotId: "body" }],
            },
        ],
        slots: [
            {
                id: "body",
                label: "Body",
                accepts: [{ kind: "any-component" }],
            },
        ],
        defaultContent: `<img data-kind="dynamic" src="/media/{{ item.image }}.jpg">`,
        dependencies: ["basic-section"],
    });
}

async function frameFixture() {
    const fixture = siteBlocHarness();
    await seedBloc(fixture.repository, "basic-section");
    await seedPublishedSiteBloc(fixture.repository, "site-framed", frameSnapshot());
    return fixture;
}

async function frame(cms: ReturnType<typeof siteBlocHarness>["cms"], mode: string) {
    return getSiteBlocFrame(new Request(`http://localhost/cms/api/site-bloc/frame?id=site-framed&mode=${mode}`), cms);
}

describe("site bloc authoring frames", () => {
    test("renders the private structure with editor resources and stable published slot markers", async () => {
        const { cms } = await frameFixture();
        const response = await frame(cms, "structure");
        const html = await response.text();

        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(html).toContain(`<script defer src="/cms/api/editor/component.js"></script>`);
        expect(html).toContain(`<script defer src="/cms/api/editor/view-script.js"></script>`);
        expect(html).not.toContain("/api/site-bloc/runtime/draft.js");
        expect(html).toContain(`<basic-section tone="soft">`);
        expect(html).toContain("cms-site-slot-placeholder");
        expect(html).toContain('data-slot-id="body"');
        expect(html).toContain("data-published-slot");
        expect(html).toContain("data-cms-editor-root");
    });

    test("renders an inert default frame and a live preview frame", async () => {
        const { cms } = await frameFixture();
        const defaultHtml = await (await frame(cms, "default")).text();
        const previewHtml = await (await frame(cms, "preview")).text();
        const defaultDocument = parseHTML(defaultHtml).document;
        const previewDocument = parseHTML(previewHtml).document;
        const defaultImage = defaultDocument.querySelector('[data-kind="dynamic"]');
        const previewImage = previewDocument.querySelector('[data-kind="dynamic"]');

        expect(defaultHtml).toContain("cms-binding-disabled");
        expect(defaultHtml).toContain("/cms/api/editor/binding-core.js");
        expect(defaultHtml).toContain("/cms/api/site-bloc/runtime/dependencies.js?id=site-framed&amp;revision=1");
        expect(defaultHtml).toContain("/cms/api/site-bloc/runtime/draft.js?id=site-framed&amp;revision=1");
        expect(defaultImage?.getAttribute("src")).toBeNull();
        expect(defaultImage?.getAttribute("data-cms-src")).toBe("/media/{{ item.image }}.jpg");

        expect(previewHtml).not.toContain("cms-binding-disabled");
        expect(previewImage?.getAttribute("src")).toBe("/media/{{ item.image }}.jpg");
        expect(previewImage?.getAttribute("data-cms-src")).toBeNull();
    });

    test("serves transitive dependency scripts without echoing the current bloc", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedPublishedSiteBloc(repository, "site-current", siteSnapshot({ dependencies: ["dependency-card"] }), {
            viewJS: "CURRENT_BLOC_MARKER();",
        });
        await seedBloc(repository, "dependency-card", {
            viewJS: `DEPENDENCY_MARKER(); const cycle = "<site-current></site-current>";`,
        });

        const response = await getDependencyScript(
            new Request("http://localhost/cms/api/site-bloc/runtime/dependencies.js?id=site-current"),
            cms,
        );
        const script = await response.text();

        expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
        expect(script).toContain("DEPENDENCY_MARKER");
        expect(script).not.toContain("CURRENT_BLOC_MARKER");
    });

    test("rejects malformed and stale runtime revisions with domain HTTP errors", async () => {
        const { cms } = await frameFixture();

        await expect(
            getDraftScript(
                new Request("http://localhost/cms/api/site-bloc/runtime/draft.js?id=site-framed&revision=bad"),
                cms,
            ),
        ).rejects.toBeInstanceOf(ContentValidationError);
        await expect(
            getDraftScript(
                new Request("http://localhost/cms/api/site-bloc/runtime/draft.js?id=site-framed&revision=2"),
                cms,
            ),
        ).rejects.toBeInstanceOf(BlocRevisionConflictError);
        await expect(
            getDependencyScript(
                new Request("http://localhost/cms/api/site-bloc/runtime/dependencies.js?id=site-framed&revision=2"),
                cms,
            ),
        ).rejects.toBeInstanceOf(BlocRevisionConflictError);
    });
});
