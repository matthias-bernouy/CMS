import { collectionSettingsSchema, type CollectionComponentSettings } from "@bernouy/cms-repository/collections";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";

type BlocSettings = { id: string; collectionSettings?: CollectionComponentSettings };
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

/** Validate each stored host's attributes against its installed bloc definition. */
export function assertCollectionSettingAttributes(content: string, blocs: readonly BlocSettings[]): void {
    const configured = blocs.filter((bloc) => bloc.collectionSettings);
    if (configured.length === 0) {
        return;
    }
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = content;
    for (const bloc of configured) {
        const items = bloc.collectionSettings!;
        const schema = collectionSettingsSchema(items);
        for (const host of Array.from(document.querySelectorAll(bloc.id))) {
            try {
                const settings: Record<string, unknown> = {};
                for (const item of items) {
                    if (item.type === "boolean") {
                        settings[item.id] = host.hasAttribute(item.id);
                        continue;
                    }
                    if (!host.hasAttribute(item.id)) {
                        continue;
                    }
                    const value = host.getAttribute(item.id)!;
                    settings[item.id] = item.type === "number" || item.type === "integer" ? parseNumber(value) : value;
                }
                validateSchemaValue(schema, settings);
            } catch (error) {
                throw new ContentValidationError(
                    "content",
                    `invalid ${bloc.id} settings: ${error instanceof Error ? error.message : "schema mismatch"}`,
                );
            }
        }
    }
}

function parseNumber(value: string): number {
    if (!JSON_NUMBER.test(value)) {
        throw new TypeError("numeric attributes must use JSON number syntax");
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new TypeError("numeric attributes must be finite");
    }
    return parsed;
}
