import type { DataScope, Setting, TextCapability } from "@bernouy/cms-content/editor";
import { setDataScopes, wireContentControl, wireRichTextControl } from "../controlWiring";
import { createSettingControl } from "./settingControls";

type EmitContentChange = (value: string, format: "text" | "html") => void;

export function renderTextCapability(
    capability: TextCapability,
    value: string,
    dataScopes: DataScope[],
    emitContentChange: EmitContentChange,
): HTMLElement {
    const section = document.createElement("cms-editor-v2-section");
    section.setAttribute("label", "Content");
    const setting: Setting = {
        type: "text",
        label: capability.format === "richtext" ? "Rich text" : "Text",
        attribute: "__text",
        defaultValue: value,
        help: capability.format === "richtext" ? undefined : formatTextCapability(capability),
    };
    const control = createSettingControl(
        capability.format === "richtext" ? "cms-editor-v2-rich-text-editor" : "cms-editor-v2-text-input",
        setting,
    );
    if (capability.format === "richtext") {
        control.setAttribute("capability", JSON.stringify(capability));
        control.setAttribute("data-scopes", JSON.stringify(dataScopes));
        wireRichTextControl(control, (content) => emitContentChange(content, "html"));
    } else {
        if (capability.dynamic) {
            setDataScopes(control, dataScopes);
        }
        wireContentControl(control, "input", (content) => emitContentChange(content, "text"));
    }
    section.append(control);
    return section;
}

function formatTextCapability(capability: TextCapability): string {
    const options = [
        capability.bold ? "bold" : null,
        capability.italic ? "italic" : null,
        capability.link ? "link" : null,
        capability.code ? "code" : null,
        capability.dynamic ? "dynamic" : null,
    ].filter((option): option is string => Boolean(option));
    return options.length > 0 ? options.join(", ") : "Plain text";
}
