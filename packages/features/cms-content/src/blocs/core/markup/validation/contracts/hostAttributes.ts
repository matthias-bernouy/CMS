import type { BlocSettingItem, BlocSettings, ManagedNativeElement } from "cms-content/pages/interfaces/document";
import { isPlatformNativeAttributeAllowed } from "cms-content/blocs/core/validation/nativeHtml";
import { COMPOSITION_CONTROLLER_ATTRIBUTE } from "cms-content/blocs/core/composition/expandCompositions";
import {
    implementationAccessibilityAttributeIssue,
    isSupportedAriaAttribute,
} from "cms-content/blocs/core/markup/validation/contracts/accessibilityAttributes";
import {
    isCmsBindingAttribute,
    nativeBindingAttributeIssue,
    nativeBindingElementIssue,
} from "cms-content/blocs/core/validation/nativeBindings";
import { boundAttributeValueIssue } from "cms-content/blocs/core/markup/validation/contracts/attributeBindings";

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const SLOT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export type PageBlocHostContract = {
    readonly id: string;
    readonly root: ManagedNativeElement;
    readonly settings?: BlocSettings;
};

/** Closed Page-host attribute policy shared by every Page producer. */
export function pageBlocHostAttributesIssue(
    attributes: Readonly<Record<string, string>>,
    contract: PageBlocHostContract,
    nested: boolean,
    allowDynamicSettings = true,
    allowImplementationAttributes = false,
    hostTag?: string,
): string | null {
    const settings = contract.settings ?? [];
    const settingsById = new Map(settings.map((item) => [item.id, item]));
    for (const [name, value] of Object.entries(attributes)) {
        if (name === "cms-bloc") {
            if (value !== contract.id) {
                return `Bloc root identity must be ${JSON.stringify(contract.id)}`;
            }
            continue;
        }
        if (allowImplementationAttributes && name === COMPOSITION_CONTROLLER_ATTRIBUTE) {
            if (value !== "") {
                return `${COMPOSITION_CONTROLLER_ATTRIBUTE} must use an empty HTML attribute`;
            }
            continue;
        }
        if (name === "slot") {
            if (!nested) {
                return `Page root Bloc <${contract.id}> cannot target a slot`;
            }
            if (!SLOT_NAME.test(value)) {
                return `Bloc <${contract.id}> slot target is invalid`;
            }
            continue;
        }
        const setting = settingsById.get(name);
        if (setting) {
            const kind = setting.type === "string" ? "declared-string" : setting.type;
            const bindingIssue = boundAttributeValueIssue(value, kind);
            if (bindingIssue !== undefined) {
                if (!allowDynamicSettings) {
                    return `Bloc <${contract.id}> setting ${JSON.stringify(name)} cannot be dynamic here`;
                }
                if (bindingIssue) {
                    return `Bloc <${contract.id}> setting ${JSON.stringify(name)} is invalid: ${bindingIssue}`;
                }
                continue;
            }
        }
        if (isCmsBindingAttribute(name)) {
            if (!hostTag && allowImplementationAttributes) {
                continue;
            }
            const attributeIssue = nativeBindingAttributeIssue(name, value);
            if (attributeIssue) {
                return attributeIssue;
            }
            const placementIssue = hostTag ? nativeBindingElementIssue(hostTag, attributes) : null;
            if (placementIssue) {
                return placementIssue;
            }
            if (hostTag) {
                continue;
            }
        }
        if (allowImplementationAttributes) {
            const implementationKind = dynamicImplementationAttributeKind(name);
            if (implementationKind) {
                const bindingIssue = boundAttributeValueIssue(value, implementationKind);
                if (bindingIssue !== undefined) {
                    if (bindingIssue) {
                        return `Bloc <${contract.id}> attribute ${JSON.stringify(name)} is invalid: ${bindingIssue}`;
                    }
                    continue;
                }
            }
        }
        if (allowImplementationAttributes && isImplementationAttribute(name, value)) {
            continue;
        }
        const accessibilityIssue = allowImplementationAttributes
            ? implementationAccessibilityAttributeIssue(name, value)
            : undefined;
        if (accessibilityIssue !== undefined) {
            if (accessibilityIssue) {
                return accessibilityIssue;
            }
            continue;
        }
        if (
            !settingsById.has(name) &&
            !contract.root.accepts.some((tag) => isPlatformNativeAttributeAllowed(tag, name)) &&
            !isImplementationAttribute(name, value) &&
            implementationAccessibilityAttributeIssue(name, value) === undefined
        ) {
            return `Bloc <${contract.id}> attribute ${JSON.stringify(name)} is neither a declared setting nor a native root attribute`;
        }
    }
    try {
        for (const setting of settings) {
            const value = attributes[setting.id];
            const kind = setting.type === "string" ? "declared-string" : setting.type;
            if (value !== undefined && boundAttributeValueIssue(value, kind) !== undefined) {
                continue;
            }
            validateSettingValue(setting, value);
        }
        return null;
    } catch (error) {
        return `Bloc <${contract.id}> settings are invalid: ${error instanceof Error ? error.message : "constraint mismatch"}`;
    }
}

function dynamicImplementationAttributeKind(name: string): "boolean" | "string" | null {
    if (name === "hidden") {
        return "boolean";
    }
    if (name === "id" || name === "tabindex" || /^data-(?!cms-)[a-z][a-z0-9-]*$/u.test(name)) {
        return "string";
    }
    return isSupportedAriaAttribute(name) ? "string" : null;
}

function isImplementationAttribute(name: string, value: string): boolean {
    if (name === "id") {
        return /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(value);
    }
    if (name === "hidden") {
        return value === "";
    }
    if (name === "tabindex") {
        return value === "-1" || value === "0";
    }
    if (name === "part") {
        const tokens = value.split(/\s+/u).filter(Boolean);
        return tokens.length > 0 && tokens.length <= 16 && tokens.every((token) => SLOT_NAME.test(token));
    }
    return false;
}

function validateSettingValue(setting: BlocSettingItem, attribute: string | undefined): void {
    if (setting.type === "boolean") {
        if (attribute !== undefined && attribute !== "") {
            throw new TypeError(`boolean setting ${JSON.stringify(setting.id)} must use an empty HTML attribute`);
        }
        return;
    }
    if (setting.type === "number" || setting.type === "integer") {
        const value = attribute === undefined ? setting.default : parseNumber(setting.id, attribute);
        if (setting.type === "integer" && !Number.isSafeInteger(value)) {
            throw new TypeError(`setting ${JSON.stringify(setting.id)} must be a safe integer`);
        }
        if (setting.minimum !== undefined && value < setting.minimum) {
            throw new TypeError(`setting ${JSON.stringify(setting.id)} must be at least ${setting.minimum}`);
        }
        if (setting.maximum !== undefined && value > setting.maximum) {
            throw new TypeError(`setting ${JSON.stringify(setting.id)} must be at most ${setting.maximum}`);
        }
        return;
    }
    if (setting.type !== "string") {
        return;
    }
    const value = attribute ?? setting.default;
    const options =
        setting.control.kind === "select" || setting.control.kind === "segmented"
            ? setting.control.options.map((option) => option.value)
            : undefined;
    const maximum = setting.maxLength ?? options?.reduce((max, option) => Math.max(max, option.length), 0) ?? 256;
    if (setting.minLength !== undefined && value.length < setting.minLength) {
        throw new TypeError(`setting ${JSON.stringify(setting.id)} is shorter than ${setting.minLength}`);
    }
    if (value.length > maximum) {
        throw new TypeError(`setting ${JSON.stringify(setting.id)} is longer than ${maximum}`);
    }
    if (options && !options.includes(value)) {
        throw new TypeError(`setting ${JSON.stringify(setting.id)} is not an accepted option`);
    }
}

function parseNumber(id: string, value: string): number {
    if (!JSON_NUMBER.test(value)) {
        throw new TypeError(`numeric setting ${JSON.stringify(id)} must use JSON number syntax`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new TypeError(`numeric setting ${JSON.stringify(id)} must be finite`);
    }
    return parsed;
}
