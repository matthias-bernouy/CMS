import { validateSchemaValue } from "cms-repository/exports/contracts/schema";
import type { CollectionComponentSettings } from "../../../interfaces/CollectionBloc";
import { collectionSettingsSchema } from "../../parsing/blocs/settingSchema";

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const SLOT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export type PageBlocHostContract = {
    readonly id: string;
    readonly settings?: CollectionComponentSettings;
};

/** Closed Page-host attribute policy shared by collection admission and runtime writes. */
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
    if (settings.length === 0) {
        return null;
    }
    try {
        validateSchemaValue(collectionSettingsSchema(settings), settingValues(attributes, settings));
        return null;
    } catch (error) {
        return `Bloc <${contract.id}> settings are invalid: ${error instanceof Error ? error.message : "schema mismatch"}`;
    }
}

function settingValues(
    attributes: Readonly<Record<string, string>>,
    settings: CollectionComponentSettings,
): Record<string, unknown> {
    return Object.fromEntries(
        settings.map((item) => {
            if (item.type === "boolean") {
                const value = attributes[item.id];
                if (value !== undefined && value !== "") {
                    throw new TypeError(`boolean setting ${JSON.stringify(item.id)} must use an empty HTML attribute`);
                }
                return [item.id, value !== undefined];
            }
            const value = attributes[item.id];
            if (value === undefined) {
                return [item.id, item.default];
            }
            if (item.type === "number" || item.type === "integer") {
                if (!JSON_NUMBER.test(value)) {
                    throw new TypeError(`numeric setting ${JSON.stringify(item.id)} must use JSON number syntax`);
                }
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    throw new TypeError(`numeric setting ${JSON.stringify(item.id)} must be finite`);
                }
                return [item.id, parsed];
            }
            return [item.id, value];
        }),
    );
}
