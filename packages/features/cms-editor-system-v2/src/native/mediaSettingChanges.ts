import type { Editor, SettingAttributeChanges, SettingControl } from "@bernouy/cms-content/editor";

export type NativeMediaSettingChange =
    | { kind: "accessible-name-draft" }
    | { kind: "attributes"; attributes: SettingAttributeChanges };

type MediaAccessibility = {
    accessibleName: "alt" | "aria-label";
    decorativeRole: string;
    informativeRole: string;
    isDecorative: boolean;
};

const accessibleNameDrafts = new WeakMap<Element, string>();

export function prepareNativeMediaSettingChange(
    editor: Editor,
    setting: SettingControl,
    value: string | boolean,
    attributes: SettingAttributeChanges | undefined,
): NativeMediaSettingChange | null {
    if (typeof value !== "string") {
        return null;
    }
    const media = mediaAccessibility(editor.target);
    if (!media) {
        return null;
    }
    if (setting.type === "text" && setting.attribute === media.accessibleName && media.isDecorative) {
        accessibleNameDrafts.set(editor.target, value);
        return { kind: "accessible-name-draft" };
    }
    if (setting.type !== "segmented" || setting.attribute !== "role") {
        return null;
    }
    if (value === media.decorativeRole) {
        rememberCurrentAccessibleName(editor, media.accessibleName);
        return {
            kind: "attributes",
            attributes: decorativeAttributes(editor.target.localName, attributes),
        };
    }
    if (value !== media.informativeRole) {
        return null;
    }

    const changes = informativeAttributes(editor.target.localName, attributes);
    const draft = accessibleNameDrafts.get(editor.target);
    if (draft !== undefined) {
        changes[media.accessibleName] = draft;
    }
    return { kind: "attributes", attributes: changes };
}

export function nativeMediaAccessibleNameDraft(editor: Editor, setting: SettingControl): string | undefined {
    const media = mediaAccessibility(editor.target);
    if (!media?.isDecorative || setting.type !== "text" || setting.attribute !== media.accessibleName) {
        return undefined;
    }
    return accessibleNameDrafts.get(editor.target);
}

function mediaAccessibility(target: Element): MediaAccessibility | null {
    if (target.localName === "img") {
        return {
            accessibleName: "alt",
            decorativeRole: "presentation",
            informativeRole: "",
            isDecorative: target.getAttribute("role") === "presentation",
        };
    }
    if (target.localName === "svg") {
        return {
            accessibleName: "aria-label",
            decorativeRole: "",
            informativeRole: "img",
            isDecorative: !target.hasAttribute("role"),
        };
    }
    return null;
}

function rememberCurrentAccessibleName(editor: Editor, attribute: "alt" | "aria-label"): void {
    const current = editor.target.getAttribute(attribute);
    if (current?.trim()) {
        accessibleNameDrafts.set(editor.target, current);
    }
}

function decorativeAttributes(tag: string, attributes: SettingAttributeChanges | undefined): SettingAttributeChanges {
    if (tag === "img") {
        return { ...attributes, role: "presentation", "aria-hidden": "true", alt: "" };
    }
    return { ...attributes, role: null, "aria-hidden": "true", "aria-label": null };
}

function informativeAttributes(tag: string, attributes: SettingAttributeChanges | undefined): SettingAttributeChanges {
    if (tag === "img") {
        return { ...attributes, role: null, "aria-hidden": null };
    }
    return { ...attributes, role: "img", "aria-hidden": null };
}
