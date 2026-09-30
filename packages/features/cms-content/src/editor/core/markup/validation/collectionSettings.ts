import { collectionSettingsSchema, type CollectionComponentSettings } from "@bernouy/cms-repository/collections";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";

type BlocSettings = { id: string; collectionSettings?: CollectionComponentSettings };

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
            const settings: Record<string, unknown> = {};
            for (const item of items) {
                if (item.type === "boolean") {
                    settings[item.id] = host.hasAttribute(item.id);
                    continue;
                }
                if (host.hasAttribute(item.id)) {
                    settings[item.id] = host.getAttribute(item.id)!;
                }
            }
            try {
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
