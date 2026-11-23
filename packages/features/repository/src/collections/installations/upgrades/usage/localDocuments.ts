import type { BlocRecord, SiteBlocSnapshot } from "@bernouy/content";
import { serializeSiteBlocMarkup } from "@bernouy/content";
import { parseHTML } from "linkedom";

export function localBlocDocuments(record: BlocRecord): Readonly<Record<string, string>> {
    const documents: Record<string, string> = {};
    if (record.artifact?.markupHTML) {
        documents.markup = record.artifact.markupHTML;
    }
    if (record.artifact?.defaultContent) {
        documents.initial = record.artifact.defaultContent;
    }
    if (record.artifact?.initialDocument) {
        documents.example = record.artifact.initialDocument.html;
    }
    for (const [name, snapshot] of [
        ["draft", record.siteDefinition?.draft],
        ["published", record.siteDefinition?.published],
    ] as const) {
        if (!snapshot) {
            continue;
        }
        documents[`${name}/content`] = snapshot.defaultContent;
        documents[`${name}/structure`] = serializeStructure(snapshot);
        documents[`${name}/slots`] = snapshot.slots
            .flatMap((slot) =>
                slot.accepts.flatMap((accept) =>
                    accept.kind === "component" ? [`<div cms-bloc="${escape(accept.tag)}"></div>`] : [],
                ),
            )
            .join("");
    }
    return documents;
}

function serializeStructure(snapshot: SiteBlocSnapshot): string {
    const html = serializeSiteBlocMarkup(snapshot, { controller: false });
    if (snapshot.slots.length === 0) {
        return html;
    }
    // Template placeholders are not Page content; their accepts are inventoried separately.
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = html;
    for (const slot of document.body.querySelectorAll("slot")) {
        slot.remove();
    }
    return document.body.innerHTML;
}
function escape(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
