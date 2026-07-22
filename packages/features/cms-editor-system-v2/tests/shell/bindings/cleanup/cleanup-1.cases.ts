import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    Editor,
    applyParamSyncSetting,
    defineTextControls,
    describe,
    dynamicDataScopes,
    expect,
    installDom,
    openDynamicDataPicker,
    paramSyncSettings,
    parseHTML,
    setShellFrameDocument,
    setShellViewFrameDocument,
    shellParts,
    shellState,
    test,
    type BlockPickerSelectDetail,
    type DataScope,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorStructureNode,
    type StructureTreeActionDetail,
    type TopBarSourceStateChangeDetail,
    type TopBarViewportChangeDetail,
} from "../../support/shellTestSupport";

describe("Shell", () => {
    test("shell keeps source bindings when dependent cleanup is cancelled", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        const source = document.createElement("section");
        source.setAttribute(CMS_BINDING_ATTRIBUTES.source, "/api/plans as plans");
        source.innerHTML = `<article cms-repeat="plans.items as plan"><h2>{{ plan.title }}</h2></article>`;
        const editor = new Editor(source);
        const shell = new Shell();
        document.body.append(shell);

        const originalConfirm = globalThis.confirm;
        globalThis.confirm = (() => false) as typeof globalThis.confirm;
        try {
            shellParts(shell).mutations.removeSource(editor);
        } finally {
            globalThis.confirm = originalConfirm;
        }

        expect(source.getAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe("/api/plans as plans");
        expect(source.querySelector("article")?.getAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe(
            "plans.items as plan",
        );
        expect(source.querySelector("h2")?.textContent).toBe("{{ plan.title }}");
    });

    test("shell cleans dependent bindings when removing a source", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        const source = document.createElement("section");
        source.setAttribute(CMS_BINDING_ATTRIBUTES.source, "/api/plans as plans");
        source.setAttribute(
            CMS_BINDING_ATTRIBUTES.sourceBody,
            JSON.stringify({ token: { from: "state", name: "auth.token" } }),
        );
        source.setAttribute(CMS_BINDING_ATTRIBUTES.sourceId, "plans");
        source.innerHTML = `
            <article cms-repeat="items as plan" cms-condition="plan.visible" title="Plan {{ plan.title }}">
                <h2>{{ plan.title }}</h2>
                <p>{{ unrelated.label }}</p>
            </article>
            <p class="empty" cms-condition="$sources.plans.empty">No plans</p>
            <p class="featured-empty" cms-condition="$sources.featured.empty">No featured plans</p>
        `;
        const editor = new Editor(source);
        const shell = new Shell();
        document.body.append(shell);

        const originalConfirm = globalThis.confirm;
        globalThis.confirm = (() => true) as typeof globalThis.confirm;
        try {
            shellParts(shell).mutations.removeSource(editor);
        } finally {
            globalThis.confirm = originalConfirm;
        }

        const article = source.querySelector("article")!;
        expect(source.hasAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe(false);
        expect(source.hasAttribute(CMS_BINDING_ATTRIBUTES.sourceBody)).toBe(false);
        expect(article.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe(false);
        expect(article.hasAttribute(CMS_BINDING_ATTRIBUTES.condition)).toBe(false);
        expect(article.getAttribute("title")).toBe("Plan");
        expect(article.querySelector("h2")?.textContent).toBe("");
        expect(article.querySelector("p")?.textContent).toBe("{{ unrelated.label }}");
        expect(source.querySelector(".empty")?.hasAttribute(CMS_BINDING_ATTRIBUTES.condition)).toBe(false);
        expect(source.querySelector(".featured-empty")?.getAttribute(CMS_BINDING_ATTRIBUTES.condition)).toBe(
            "$sources.featured.empty",
        );
    });
});
