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
    test("block picker filters blocks by category and inserts from details", async () => {
        installDom();

        const { BLOCK_PICKER_SELECT_EVENT, BlockPickerModal } = await import(
            "../../../../src/components/Layout/Pickers/BlockPickerModal/BlockPickerModal"
        );

        class DemoEditor {
            constructor(readonly target: HTMLElement) {}
        }

        const card: EditorCatalogEntry = {
            tag: "p9r-card",
            label: "Card",
            description: "Groups content.",
            category: "Layout",
            subCategory: "Content",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: DemoEditor as unknown as new (target: HTMLElement) => Editor,
        };
        const paragraph: EditorCatalogEntry = {
            tag: "p",
            label: "Paragraph",
            description: "Rich text.",
            category: "Text",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: DemoEditor as unknown as new (target: HTMLElement) => Editor,
        };
        const picker = new BlockPickerModal();
        const selected: string[] = [];
        picker.addEventListener(BLOCK_PICKER_SELECT_EVENT, (event) => {
            selected.push((event as CustomEvent<BlockPickerSelectDetail>).detail.option.item?.kind ?? "");
        });
        document.body.append(picker);

        picker.open(
            [
                {
                    label: "Content",
                    options: [
                        { entry: card, slotLabel: "Content" },
                        { entry: paragraph, slotLabel: "Content" },
                    ],
                },
            ],
            "Container",
        );

        const categoryButton = Array.from(
            picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".categories .filter"),
        ).find((button) => button.textContent?.includes("Text"));
        categoryButton?.click();
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(picker.shadowRoot!.querySelector("h3")?.textContent).toBe("Paragraph");
        expect(selected).toEqual(["block"]);
    });

    test("block picker supports template source items", async () => {
        installDom();

        const { BLOCK_PICKER_SELECT_EVENT, BlockPickerModal } = await import(
            "../../../../src/components/Layout/Pickers/BlockPickerModal/BlockPickerModal"
        );

        const picker = new BlockPickerModal();
        let selectedContent = "";
        picker.addEventListener(BLOCK_PICKER_SELECT_EVENT, (event) => {
            const item = (event as CustomEvent<BlockPickerSelectDetail>).detail.option.item;
            selectedContent = item?.kind === "template" ? item.content : "";
        });
        document.body.append(picker);

        picker.open(
            [
                {
                    label: "Content",
                    options: [
                        {
                            item: {
                                kind: "template",
                                id: "tpl-1",
                                label: "Hero template",
                                description: "Reusable hero.",
                                category: "Marketing",
                                content: "<section></section>",
                            },
                            slotLabel: "Content",
                        },
                    ],
                },
            ],
            "Container",
        );

        picker.shadowRoot!.querySelector<HTMLButtonElement>(".sources .filter:nth-child(2)")!.click();
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(picker.shadowRoot!.querySelector("h3")?.textContent).toBe("Hero template");
        expect(selectedContent).toBe("<section></section>");
    });
});
