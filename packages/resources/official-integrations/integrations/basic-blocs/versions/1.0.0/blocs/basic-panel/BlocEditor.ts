import { Editor, registerEditor } from "@bernouy/cms-control/editor";

export class BasicPanelEditor extends Editor {
    protected override contentSlots() {
        return [{
            label: "Content",
            accepts: [{ kind: "any-component" as const }],
        }];
    }
}

registerEditor({ editor: BasicPanelEditor });
