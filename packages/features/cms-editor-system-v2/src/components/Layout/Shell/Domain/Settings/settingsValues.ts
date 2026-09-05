import {
    type ContentSlot,
    type Editor,
    type Setting,
    type SettingControl,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import {
    NETWORK_BINDING_ATTRIBUTES,
    prepareNetworkInertBindings,
    readNetworkBindingAttribute,
    type NetworkBindingAttribute,
} from "@bernouy/components/binding-dom";
import { sanitizeNativeRichTextFragment } from "../../../../../native/richTextPolicy";
import { nativeMediaAccessibleNameDraft } from "../../../../../native/mediaSettingChanges";

import { isParamSyncSetting } from "./paramSync";
import { isPageStateSetting } from "./pageState";

export function resolveSettingsValues(editor: Editor, sections: SettingSection[]): SettingSection[] {
    return sections.map((section) => ({
        ...section,
        settings: section.settings.map((setting) => resolveSetting(editor, setting)),
    }));
}

export function getTextValue(editor: Editor, format: "text" | "richtext"): string {
    editor = textTargetEditor(editor);
    assertTextSlotCompatibility(editor);

    const textFragment = textContentFragment(editor);
    if (format === "richtext") {
        sanitizeNativeRichTextFragment(textFragment, editor.target.localName);
    }
    const value = format === "richtext" ? textFragment.innerHTML : (textFragment.textContent ?? "");

    return editor.getContentSlots().length > 0 ? value.trim() : value;
}

export function setTextValue(editor: Editor, format: "text" | "richtext", value: string): void {
    editor = textTargetEditor(editor);
    assertTextSlotCompatibility(editor);

    const reserved = reservedSlotNames(editor.getContentSlots());
    const currentNodes = Array.from(editor.target.childNodes);
    const referenceNode = currentNodes.find((node) => !isReservedSlotNode(node, reserved)) ?? editor.target.firstChild;
    const fragment = editor.target.ownerDocument.createDocumentFragment();

    if (format === "richtext") {
        const template = editor.target.ownerDocument.createElement("template");
        template.innerHTML = value;
        sanitizeNativeRichTextFragment(template.content, editor.target.localName);
        prepareNetworkInertBindings(template.content);
        fragment.append(template.content.cloneNode(true));
    } else if (value !== "") {
        fragment.append(editor.target.ownerDocument.createTextNode(value));
    }

    editor.target.insertBefore(fragment, referenceNode);

    for (const node of currentNodes) {
        if (!isReservedSlotNode(node, reserved)) {
            node.remove();
        }
    }
}

function resolveSetting(editor: Editor, setting: Setting): Setting {
    if (setting.type === "row") {
        return {
            ...setting,
            settings: setting.settings.map((child) => resolveSettingValue(editor, child)),
        };
    }

    return resolveSettingValue(editor, setting);
}

function resolveSettingValue(editor: Editor, setting: SettingControl): SettingControl {
    if (isParamSyncSetting(setting) || isPageStateSetting(setting)) {
        return setting;
    }

    const targetEditor = settingTargetEditor(editor, setting);

    if (setting.type === "text") {
        const accessibleNameDraft = nativeMediaAccessibleNameDraft(targetEditor, setting);
        if (accessibleNameDraft !== undefined) {
            return { ...setting, defaultValue: accessibleNameDraft };
        }
    }

    if (setting.type === "toggle") {
        return {
            ...setting,
            defaultValue: targetEditor.target.hasAttribute(setting.attribute),
        };
    }

    const resolved = {
        ...setting,
        defaultValue: readSettingAttribute(targetEditor.target, setting.attribute) ?? setting.defaultValue,
    } as SettingControl;

    if (resolved.type === "color" && resolved.customAttribute) {
        return {
            ...resolved,
            customDefaultValue:
                targetEditor.target.getAttribute(resolved.customAttribute) ?? resolved.customDefaultValue,
        };
    }

    return resolved;
}

export function settingTargetEditor(editor: Editor, setting: SettingControl): Editor {
    return setting.target === "managed-native" ? (editor.getManagedNativeEditor() ?? editor) : editor;
}

export function textTargetEditor(editor: Editor): Editor {
    return editor.getManagedNativeEditor() ?? editor;
}

function readSettingAttribute(element: Element, name: string): string | null {
    return isNetworkBindingAttribute(name) ? readNetworkBindingAttribute(element, name) : element.getAttribute(name);
}

function isNetworkBindingAttribute(name: string): name is NetworkBindingAttribute {
    return (NETWORK_BINDING_ATTRIBUTES as readonly string[]).includes(name);
}

function assertTextSlotCompatibility(editor: Editor): void {
    const hasDefaultSlot = editor.getContentSlots().some((slot) => !slot.slot);
    if (!hasDefaultSlot) {
        return;
    }

    throw new Error("Editors cannot combine textCapability() with an unnamed content slot.");
}

function textContentFragment(editor: Editor): HTMLElement {
    const reserved = reservedSlotNames(editor.getContentSlots());
    const container = editor.target.ownerDocument.createElement("div");

    for (const node of Array.from(editor.target.childNodes)) {
        if (isReservedSlotNode(node, reserved)) {
            continue;
        }
        container.append(node.cloneNode(true));
    }

    return container;
}

function reservedSlotNames(slots: ContentSlot[]): Set<string> {
    return new Set(slots.map((slot) => slot.slot).filter((slot): slot is string => Boolean(slot)));
}

function isReservedSlotNode(node: ChildNode, reserved: Set<string>): boolean {
    return node.nodeType === 1 && reserved.has((node as Element).getAttribute("slot") ?? "");
}
