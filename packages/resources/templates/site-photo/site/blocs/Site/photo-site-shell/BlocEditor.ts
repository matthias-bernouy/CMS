import { Editor, type ContentSlot } from "@bernouy/cms-content/editor";

export class PhotoSiteShellEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Header",
                slot: "header",
                max: 1,
                accepts: [{ kind: "component", tag: "photo-site-header" }],
            },
            { label: "Page content", accepts: [{ kind: "any-component" }] },
            {
                label: "Footer",
                slot: "footer",
                max: 1,
                accepts: [{ kind: "component", tag: "photo-site-footer" }],
            },
        ];
    }
}
