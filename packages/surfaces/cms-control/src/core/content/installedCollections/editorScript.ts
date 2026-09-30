import type { BlocRecord } from "@bernouy/cms-content";
import { installedBlocInitialMarkup, installedBlocSettingSections } from "./settings";
/** Uses the same public editor catalogue contract as compiled composition editors. */
export function installedCollectionEditorScript(records: BlocRecord[]): string {
    return records
        .filter((record) => record.collectionId && record.artifact && !record.artifact.internal)
        .map(({ artifact }) => {
            const slots = Object.entries(artifact!.collectionSlots ?? {}).map(([name, slot]) => ({
                label: name,
                slot: name,
                ...(slot.min !== undefined ? { min: slot.min } : {}),
                ...(slot.max !== undefined ? { max: slot.max } : {}),
                accepts: slot.accepts?.length
                    ? slot.accepts.map((tag) => ({ kind: "component", tag }))
                    : [{ kind: "any-component" }],
            }));
            const metadata = JSON.stringify({
                tag: artifact!.id,
                label: artifact!.name,
                description: artifact!.description,
                category: artifact!.group,
                defaultContent: installedBlocInitialMarkup(artifact!),
            }).replaceAll("<", "\\u003c");
            const slotMetadata = JSON.stringify(slots).replaceAll("<", "\\u003c");
            const settingMetadata = JSON.stringify(installedBlocSettingSections(artifact!)).replaceAll("<", "\\u003c");
            return `window.p9rEditor.registerEditor({ ...${metadata}, editor: class extends window.p9rEditor.Editor { contentSlots() { return ${slotMetadata}; } settings() { return ${settingMetadata}; } } });`;
        })
        .join("\n");
}
