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
    test("shell preserves nested source bindings when removing a parent source", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        const source = document.createElement("section");
        source.setAttribute(CMS_BINDING_ATTRIBUTES.source, "/api/plans as plans");
        source.innerHTML = `
            <article cms-repeat="plans.items as plan"><h2>{{ plan.title }}</h2></article>
            <div cms-repeat="$range(3) as index">Position {{ index }}</div>
            <aside cms-source="/api/featured">
                <h3>{{ title }}</h3>
                <p cms-repeat="items as item">{{ item.label }}</p>
            </aside>
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

        const nested = source.querySelector("aside")!;
        expect(source.hasAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe(false);
        expect(source.querySelector("article")?.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe(false);
        const range = source.querySelector("div")!;
        expect(range.getAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe("$range(3) as index");
        expect(range.textContent).toBe("Position {{ index }}");
        expect(nested.getAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe("/api/featured");
        expect(nested.querySelector("h3")?.textContent).toBe("{{ title }}");
        expect(nested.querySelector("p")?.getAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe("items as item");
        expect(nested.querySelector("p")?.textContent).toBe("{{ item.label }}");
    });
});
