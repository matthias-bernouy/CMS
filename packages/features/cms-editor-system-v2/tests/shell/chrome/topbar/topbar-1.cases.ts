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
    test("topbar emits full and bleed viewport changes", async () => {
        installDom();

        const { TOPBAR_VIEWPORT_CHANGE_EVENT, TopBar } = await import(
            "../../../../src/components/Layout/TopBar/TopBar"
        );

        const topbar = new TopBar();
        document.body.append(topbar);
        topbar.connectedCallback();

        const events: TopBarViewportChangeDetail[] = [];
        topbar.addEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<TopBarViewportChangeDetail>).detail);
        });

        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="full"]')!.click();
        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')!.click();

        expect(events).toEqual([{ viewport: "full" }, { viewport: "bleed" }]);
    });

    test("topbar defaults to bleed viewport", async () => {
        installDom();

        const { TopBar } = await import("../../../../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        expect(topbar.viewport).toBe("bleed");
        expect(
            topbar
                .shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')
                ?.classList.contains("active"),
        ).toBe(true);
        expect(
            topbar
                .shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')
                ?.getAttribute("aria-pressed"),
        ).toBe("true");
        expect(
            topbar
                .shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="desktop"]')
                ?.getAttribute("aria-pressed"),
        ).toBe("false");
    });

    test("topbar defaults source preview state to loading and emits changes", async () => {
        installDom();

        const { TOPBAR_SOURCE_STATE_CHANGE_EVENT, TOPBAR_VIEW_RELOAD_EVENT, TopBar } = await import(
            "../../../../src/components/Layout/TopBar/TopBar"
        );

        const topbar = new TopBar();
        document.body.append(topbar);
        topbar.connectedCallback();

        const events: TopBarSourceStateChangeDetail[] = [];
        topbar.addEventListener(TOPBAR_SOURCE_STATE_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<TopBarSourceStateChangeDetail>).detail);
        });
        let reloads = 0;
        topbar.addEventListener(TOPBAR_VIEW_RELOAD_EVENT, () => {
            reloads += 1;
        });

        expect(topbar.sourceState).toBe("loading");
        expect(topbar.getAttribute("mode")).toBe("edit");
        expect(
            topbar
                .shadowRoot!.querySelector<HTMLButtonElement>('[data-source-state="loading"]')
                ?.getAttribute("aria-pressed"),
        ).toBe("true");
        expect(topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="view-reload"]')?.disabled).toBe(true);

        (topbar as unknown as { _setSourceState(sourceState: "error", emit: boolean): void })._setSourceState(
            "error",
            true,
        );

        expect(topbar.sourceState).toBe("error");
        expect(events).toEqual([{ sourceState: "error" }]);
        expect(
            topbar
                .shadowRoot!.querySelector<HTMLButtonElement>('[data-source-state="loading"]')
                ?.getAttribute("aria-pressed"),
        ).toBe("false");
        expect(
            topbar
                .shadowRoot!.querySelector<HTMLButtonElement>('[data-source-state="error"]')
                ?.getAttribute("aria-pressed"),
        ).toBe("true");

        topbar.mode = "view";
        expect(topbar.getAttribute("mode")).toBe("view");
        expect(topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="view-reload"]')?.disabled).toBe(
            false,
        );
        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="view-reload"]')!.click();
        expect(reloads).toBe(1);
    });

    test("topbar renders resource navigation labels", async () => {
        installDom();

        const { TopBar } = await import("../../../../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        topbar.setNavigation({
            backHref: "/cms/admin/templates",
            backLabel: "Templates",
            settingsLabel: "Template settings",
        });

        const back = topbar.shadowRoot!.querySelector<HTMLAnchorElement>(".back")!;
        expect(back.getAttribute("href")).toBe("/cms/admin/templates");
        expect(topbar.shadowRoot!.querySelector(".back-label")!.textContent).toBe("Templates");
        expect(topbar.shadowRoot!.querySelector(".settings-label")!.textContent).toBe("Template settings");
    });

    test("topbar updates save status label", async () => {
        installDom();

        const { TopBar } = await import("../../../../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        topbar.saveStatus = "Saving";

        expect(topbar.shadowRoot!.querySelector('[data-action="save"]')!.textContent).toBe("Saving");
    });
});
