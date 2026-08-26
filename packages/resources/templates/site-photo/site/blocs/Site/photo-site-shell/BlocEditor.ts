import { Editor, type ContentSlot } from "@bernouy/cms-content/editor";

export class PhotoSiteShellEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Page content", accepts: [{ kind: "any-component" }] }];
    }
}
