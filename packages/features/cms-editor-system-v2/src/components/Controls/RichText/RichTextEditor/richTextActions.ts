import type { TextCapability } from "@bernouy/cms-content/editor";

export type RichTextAction = "bold" | "italic" | "underline" | "code" | "link" | "dynamic";

export function richTextActions(capability: TextCapability): RichTextAction[] {
    const actions: RichTextAction[] = [];
    if (capability.bold) actions.push("bold");
    if (capability.italic) actions.push("italic");
    if (capability.underline) actions.push("underline");
    if (capability.code) actions.push("code");
    if (capability.link) actions.push("link");
    if (capability.dynamic) actions.push("dynamic");
    return actions;
}

export function richTextActionIcon(action: RichTextAction): string {
    const icons: Record<RichTextAction, string> = {
        bold:      "<strong>B</strong>",
        italic:    "<em>I</em>",
        underline: "<span class=\"underline-icon\">U</span>",
        code:      "<span>{}</span>",
        link:      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>`,
        dynamic:   `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>`,
    };
    return icons[action];
}

export function richTextActionTitle(action: RichTextAction): string {
    if (action === "bold") return "Bold";
    if (action === "italic") return "Italic";
    if (action === "underline") return "Underline";
    if (action === "code") return "Code";
    if (action === "link") return "Link";
    return "Dynamic data";
}
