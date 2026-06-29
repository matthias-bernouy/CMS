import { Editor, type TextCapability } from "@bernouy/cms-content/editor";

export class SpanEditor extends Editor {

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
