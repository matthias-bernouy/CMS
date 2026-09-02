import { Editor, registerEditor, type TextCapability } from "@bernouy/cms-content/editor";

export class BasicHeadingEditor extends Editor {
    protected override textCapability(): TextCapability {
        return {
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            link: true,
            dynamic: true,
        };
    }
}

registerEditor({ editor: BasicHeadingEditor });
