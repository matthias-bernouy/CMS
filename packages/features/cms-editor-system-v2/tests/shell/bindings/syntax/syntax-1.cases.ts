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
    test("shell writes repeat bindings with the stable syntax", async () => {
        installDom();

        const { Shell } = await import("../../../../src/components/Layout/Shell/Shell");

        class CardEditor extends Editor {}

        const shell = new Shell();
        const target = document.createElement("demo-card");
        const editor = new CardEditor(target);

        shellParts(shell).mutations.setRepeat(editor, "data.items", "plan");

        expect(target.getAttribute("cms-repeat")).toBe("data.items as plan");
    });

    test("shell writes source bindings with the stable syntax", async () => {
        installDom();

        const { Shell } = await import("../../../../src/components/Layout/Shell/Shell");

        class CardEditor extends Editor {}

        const shell = new Shell();
        const target = document.createElement("demo-card");
        const editor = new CardEditor(target);

        shellParts(shell).mutations.setSource(
            editor,
            { label: "Plans", url: "/api/plans", fields: [] },
            {
                url: "/api/plans",
                alias: "plans",
                params: {
                    q: { from: "queryParam", name: "address" },
                    limit: { from: "raw", value: "5" },
                },
                body: {
                    returnTo: { from: "queryParam", name: "returnTo" },
                    token: { from: "state", name: "auth.token" },
                },
                trigger: "submit",
                method: "POST",
            },
        );

        expect(target.getAttribute("cms-source")).toBe("/api/plans?q=#{address}&limit=5 as plans");
        expect(JSON.parse(target.getAttribute("cms-source-body") ?? "{}")).toEqual({
            returnTo: { from: "queryParam", name: "returnTo" },
            token: { from: "state", name: "auth.token" },
        });
        expect(target.getAttribute("cms-source-trigger")).toBe("submit");
        expect(target.getAttribute("cms-source-method")).toBe("POST");

        const searchTarget = document.createElement("demo-search");
        const searchEditor = new CardEditor(searchTarget);
        shellParts(shell).mutations.setSource(
            searchEditor,
            { label: "Search", url: "/api/search", method: "GET", fields: [] },
            {
                url: "/api/search",
                trigger: "submit",
                method: "GET",
            },
        );

        expect(searchTarget.getAttribute("cms-source")).toBe("/api/search");
        expect(searchTarget.hasAttribute("cms-source-body")).toBe(false);
        expect(searchTarget.getAttribute("cms-source-trigger")).toBe("submit");
        expect(searchTarget.getAttribute("cms-source-method")).toBe("GET");
    });

    test("shell adds query param sync settings for standard value elements", async () => {
        installDom();

        const input = document.createElement("input");
        input.setAttribute("name", "search");
        const editor = new Editor(input);

        const section = paramSyncSettings(editor);

        expect(section?.label).toBe("Query params");
        expect(section?.settings.map((setting) => [setting.attribute, setting.defaultValue])).toEqual([
            ["__cms-param-sync-enabled", false],
        ]);

        applyParamSyncSetting(editor, { attribute: "__cms-param-sync-enabled" }, true);

        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.paramSync)).toBe("search");

        const enabledSection = paramSyncSettings(editor);
        expect(enabledSection?.settings.map((setting) => [setting.attribute, setting.defaultValue])).toEqual([
            ["__cms-param-sync-enabled", true],
            ["__cms-param-sync-use-name", true],
        ]);
    });

    test("shell validates custom query param sync names", async () => {
        installDom();

        const input = document.createElement("input");
        input.setAttribute("name", "search");
        input.setAttribute(CMS_BINDING_ATTRIBUTES.paramSync, "search");
        const editor = new Editor(input);

        applyParamSyncSetting(editor, { attribute: "__cms-param-sync-use-name" }, false);
        expect(input.hasAttribute(CMS_BINDING_ATTRIBUTES.paramSync)).toBe(false);

        input.setAttribute(CMS_BINDING_ATTRIBUTES.paramSync, "search");
        applyParamSyncSetting(editor, { attribute: "__cms-param-sync-name" }, "bad name");
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.paramSync)).toBe("search");

        applyParamSyncSetting(editor, { attribute: "__cms-param-sync-name" }, "filter_racket-weight:gte");
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.paramSync)).toBe("filter_racket-weight:gte");
        expect(paramSyncSettings(editor)?.settings.map((setting) => setting.attribute)).toEqual([
            "__cms-param-sync-enabled",
            "__cms-param-sync-use-name",
            "__cms-param-sync-name",
        ]);
        expect(
            paramSyncSettings(editor)?.settings.find((setting) => setting.attribute === "__cms-param-sync-name")?.help,
        ).toContain("colons");
    });
});
