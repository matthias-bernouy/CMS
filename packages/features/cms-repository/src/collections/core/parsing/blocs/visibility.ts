import type {
    CollectionComponentSettings,
    CollectionSettingVisibilityRule,
    CollectionSettingVisibilityValue,
} from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { array, keys, record, string } from "../../values";
import { settingControlValues } from "./settingControls";

const MAX_RULES = 16;

export function parseSettingVisibility(
    value: unknown,
    path: string,
    ownId: string,
    settings: CollectionComponentSettings,
): readonly CollectionSettingVisibilityRule[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const inputs = Array.isArray(value) ? array(value, MAX_RULES, path) : [value];
    if (inputs.length === 0) {
        invalid("must contain at least one visibility rule", path);
    }
    return inputs.map((input, index) => {
        const rulePath = `${path}[${index}]`;
        const source = record(input, rulePath);
        keys(source, ["setting", "equals", "notEquals"], rulePath);
        const setting = string(source.setting, 96, `${rulePath}.setting`);
        const referenced = settings.find((item) => item.id === setting);
        if (!referenced) {
            invalid(`unknown setting ${JSON.stringify(setting)}`, `${rulePath}.setting`);
        }
        if (setting === ownId) {
            invalid("a setting cannot control its own visibility", `${rulePath}.setting`);
        }
        if (
            referenced.type !== "boolean" &&
            (referenced.type !== "string" || !settingControlValues(referenced.control))
        ) {
            invalid("visibility requires a boolean or enumerated setting", `${rulePath}.setting`);
        }
        if (source.equals === undefined && source.notEquals === undefined) {
            invalid("must declare equals or notEquals", rulePath);
        }
        return {
            setting,
            ...(source.equals === undefined
                ? {}
                : { equals: comparison(source.equals, referenced, `${rulePath}.equals`) }),
            ...(source.notEquals === undefined
                ? {}
                : { notEquals: comparison(source.notEquals, referenced, `${rulePath}.notEquals`) }),
        };
    });
}

export function assertVisibilityAcyclic(settings: CollectionComponentSettings, path: string): void {
    const byId = new Map(settings.map((item) => [item.id, item]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
        if (visiting.has(id)) {
            invalid("cyclic setting visibility", path);
        }
        if (visited.has(id)) {
            return;
        }
        visiting.add(id);
        for (const rule of byId.get(id)?.visibleWhen ?? []) {
            visit(rule.setting);
        }
        visiting.delete(id);
        visited.add(id);
    };
    for (const item of settings) {
        visit(item.id);
    }
}

function comparison(
    value: unknown,
    setting: CollectionComponentSettings[number],
    path: string,
): CollectionSettingVisibilityValue | readonly CollectionSettingVisibilityValue[] {
    if (Array.isArray(value)) {
        const options = array(value, MAX_RULES, path);
        if (options.length === 0) {
            invalid("comparison values must not be empty", path);
        }
        return options.map((entry, index) => comparisonValue(entry, setting, `${path}[${index}]`));
    }
    return comparisonValue(value, setting, path);
}

function comparisonValue(
    value: unknown,
    setting: CollectionComponentSettings[number],
    path: string,
): CollectionSettingVisibilityValue {
    if (setting.type === "boolean") {
        if (typeof value !== "boolean") {
            invalid("boolean visibility expects true or false", path);
        }
        return value;
    }
    if (typeof value !== "string" || !settingControlValues(setting.control)?.includes(value)) {
        invalid("visibility value must be a declared option", path);
    }
    return value;
}
