import { Editor, type TextCapability } from "@bernouy/cms-content/editor";

export class CodeEditor extends Editor {

    protected override textCapability(): TextCapability {
        return {
            format: "text",
            dynamic: true,
        };
    }

}
