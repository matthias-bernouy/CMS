import {
    CMS_BINDING_ATTRIBUTES,
    type EditorCatalogEntry,
    type Setting,
    type SettingControl,
    type SettingSection,
} from "@bernouy/cms-content/editor";

import type { BlockPickerItem } from "../components/Layout/Pickers/BlockPickerModal/BlockPickerModal";

export type EditorInteractionPolicy = {
    bindings?: boolean;
    conditions?: boolean;
    repeats?: boolean;
    looseMedia?: boolean;
    canInsertTag?: (tag: string, entry: EditorCatalogEntry) => boolean;
};

export type EditorInsertableCatalogEntry = EditorCatalogEntry & {
    insertable?: boolean;
};

export type ResolvedEditorInteractionPolicy = Required<Omit<EditorInteractionPolicy, "canInsertTag">> & {
    canInsertTag?: EditorInteractionPolicy["canInsertTag"];
};

export const DEFAULT_EDITOR_INTERACTION_POLICY: ResolvedEditorInteractionPolicy = {
    bindings: true,
    conditions: true,
    repeats: true,
    looseMedia: true,
};

export function resolveEditorInteractionPolicy(policy: EditorInteractionPolicy = {}): ResolvedEditorInteractionPolicy {
    return {
        ...DEFAULT_EDITOR_INTERACTION_POLICY,
        ...policy,
    };
}

export function isCatalogEntryInsertable(
    policy: ResolvedEditorInteractionPolicy,
    entry: EditorInsertableCatalogEntry,
): boolean {
    if (entry.insertable === false) {
        return false;
    }
    return policy.canInsertTag?.(entry.tag, entry) ?? true;
}

export function isInsertionItemAllowed(policy: ResolvedEditorInteractionPolicy, item: BlockPickerItem): boolean {
    if (item.kind === "media") {
        return policy.looseMedia;
    }
    return isCatalogEntryInsertable(policy, item.entry);
}

export function isSettingAllowed(policy: ResolvedEditorInteractionPolicy, setting: SettingControl): boolean {
    return isAttributeAllowed(policy, setting.attribute);
}

export function isAttributeAllowed(policy: ResolvedEditorInteractionPolicy, attribute: string): boolean {
    if (attribute === CMS_BINDING_ATTRIBUTES.condition) {
        return policy.bindings && policy.conditions;
    }
    if (attribute === CMS_BINDING_ATTRIBUTES.repeat) {
        return policy.bindings && policy.repeats;
    }
    if (BINDING_ATTRIBUTES.has(attribute)) {
        return policy.bindings;
    }
    return true;
}

export function filterSettingSections(
    policy: ResolvedEditorInteractionPolicy,
    sections: SettingSection[],
): SettingSection[] {
    return sections.flatMap((section): SettingSection[] => {
        const settings = section.settings.flatMap((setting): Setting[] => filterSetting(policy, setting));
        return settings.length > 0 ? [{ ...section, settings }] : [];
    });
}

function filterSetting(policy: ResolvedEditorInteractionPolicy, setting: Setting): Setting[] {
    if (setting.type !== "row") {
        return isSettingAllowed(policy, setting) ? [setting] : [];
    }
    const settings = setting.settings.filter((child) => isSettingAllowed(policy, child));
    return settings.length > 0 ? [{ ...setting, settings }] : [];
}

const BINDING_ATTRIBUTES = new Set<string>(Object.values(CMS_BINDING_ATTRIBUTES));
