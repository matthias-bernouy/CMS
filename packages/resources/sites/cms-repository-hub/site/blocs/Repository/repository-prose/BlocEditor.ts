import { Editor, type ContentSlot } from "@bernouy/cms-content/editor";

export class RepositoryProseEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Content", accepts: [{ kind: "any-component" }] }];
    }
}
