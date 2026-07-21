import type {
    Setting,
    SettingControl,
    SettingVisibilityRule,
    SettingVisibilityValue,
} from "@bernouy/cms-content/editor";
import type { SettingsViewAttributeChanges } from "../SettingsView";

export function visibleSettings(settings: Setting[]): Setting[] {
    const values = collectSettingValues(settings);
    return settings.flatMap((setting): Setting[] => {
        if (!isSettingVisible(setting.visibleWhen, values)) {
            return [];
        }
        if (setting.type !== "row") {
            return [setting];
        }

        const visibleChildren = setting.settings.filter((child) => isSettingVisible(child.visibleWhen, values));
        return visibleChildren.length > 0 ? [{ ...setting, settings: visibleChildren }] : [];
    });
}

export function attributesForSettingValue(
    setting: SettingControl,
    value: string | boolean,
): SettingsViewAttributeChanges | undefined {
    const matchingRules = setting.attributesOnValue?.filter((rule) => visibilityValueMatches(value, rule.value)) ?? [];
    if (matchingRules.length === 0) {
        return undefined;
    }

    const attributes: SettingsViewAttributeChanges = { [setting.attribute]: value };
    for (const rule of matchingRules) {
        Object.assign(attributes, rule.attributes);
    }
    return attributes;
}

function collectSettingValues(settings: Setting[]): Map<string, SettingControl["defaultValue"]> {
    const values = new Map<string, SettingControl["defaultValue"]>();
    for (const setting of settings) {
        if (setting.type === "row") {
            for (const child of setting.settings) {
                values.set(child.attribute, child.defaultValue);
            }
        } else {
            values.set(setting.attribute, setting.defaultValue);
        }
    }
    return values;
}

function isSettingVisible(
    visibleWhen: Setting["visibleWhen"],
    values: Map<string, SettingControl["defaultValue"]>,
): boolean {
    if (!visibleWhen) {
        return true;
    }
    const rules = Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen];
    return rules.every((rule) => matchesVisibilityRule(rule, values.get(rule.attribute)));
}

function matchesVisibilityRule(rule: SettingVisibilityRule, actual: SettingControl["defaultValue"]): boolean {
    if (rule.equals !== undefined && !visibilityValueMatches(actual, rule.equals)) {
        return false;
    }
    if (rule.notEquals !== undefined && visibilityValueMatches(actual, rule.notEquals)) {
        return false;
    }
    return true;
}

function visibilityValueMatches(
    actual: SettingControl["defaultValue"],
    expected: SettingVisibilityValue | SettingVisibilityValue[],
): boolean {
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    return expectedValues.some((value) => normalizeVisibilityValue(actual) === normalizeVisibilityValue(value));
}

function normalizeVisibilityValue(value: SettingControl["defaultValue"] | SettingVisibilityValue): string | boolean {
    return typeof value === "boolean" ? value : String(value ?? "");
}
