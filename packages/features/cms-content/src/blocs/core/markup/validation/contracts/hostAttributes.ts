import type { BlocSettingItem, BlocSettings } from "cms-content/pages/interfaces/document";

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const SLOT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export type PageBlocHostContract = {
    readonly id: string;
    readonly settings?: BlocSettings;
};

/** Closed Page-host attribute policy shared by every Page producer. */
export function pageBlocHostAttributesIssue(
    attributes: Readonly<Record<string, string>>,
    contract: PageBlocHostContract,
    nested: boolean,
): string | null {
    const settings = contract.settings ?? [];
    const settingIds = new Set(settings.map((item) => item.id));
    for (const [name, value] of Object.entries(attributes)) {
        if (name === "slot") {
            if (!nested) {
                return `Page root Bloc <${contract.id}> cannot target a slot`;
            }
            if (!SLOT_NAME.test(value)) {
                return `Bloc <${contract.id}> slot target is invalid`;
            }
            continue;
        }
        if (!settingIds.has(name)) {
            return `Bloc <${contract.id}> attribute ${JSON.stringify(name)} is not a declared setting`;
        }
    }
    try {
        for (const setting of settings) {
            validateSettingValue(setting, attributes[setting.id]);
        }
        return null;
    } catch (error) {
        return `Bloc <${contract.id}> settings are invalid: ${error instanceof Error ? error.message : "constraint mismatch"}`;
    }
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
