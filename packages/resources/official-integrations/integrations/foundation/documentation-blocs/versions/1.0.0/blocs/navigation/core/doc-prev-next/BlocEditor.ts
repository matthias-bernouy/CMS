import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Previous page",
                accepts: [{ kind: "component", tag: "a" }],
                slot: "previous",
                max: 1,
            },
            {
                label: "Next page",
                accepts: [{ kind: "component", tag: "a" }],
                slot: "next",
                max: 1,
            },
        ];
    }

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
