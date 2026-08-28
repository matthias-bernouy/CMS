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
    test("block picker selects media source directly", async () => {
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
                    label: "Image",
                    options: [
                        { entry: card, slotLabel: "Image" },
                        {
                            item: {
                                kind: "media",
                                label: "Media",
                                description: "Choose a file from the CMS library.",
                                category: "Media",
                                accept: ["image"],
                            },
                            slotLabel: "Image",
                        },
                    ],
                },
            ],
            "Media feature",
        );

        picker.shadowRoot!.querySelector<HTMLButtonElement>(".sources .filter:nth-child(2)")!.click();

        expect(selected).toEqual(["media"]);
    });
});
