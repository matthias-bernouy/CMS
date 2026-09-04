import { Editor, registerEditor, type TextCapability } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override textCapability(): TextCapability {
        return {
            format: "text",
            dynamic: true,
        };
    }
}

registerEditor({ editor: BlocEditor });
