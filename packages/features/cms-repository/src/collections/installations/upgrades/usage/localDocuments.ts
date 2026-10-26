import type { BlocRecord, SiteBlocNode } from "@bernouy/cms-content";

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
        documents[`${name}/structure`] = serializeNodes(snapshot.structure);
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

function serializeNodes(nodes: readonly SiteBlocNode[]): string {
    return nodes
        .map((node) => {
            if (node.kind === "text") {
                return escape(node.value);
            }
            if (node.kind === "slot") {
                return "";
            }
            const attributes = Object.entries(node.attributes)
                .map(([name, value]) => ` ${name}="${escape(value)}"`)
                .join("");
            return `<${node.tag}${attributes}>${serializeNodes(node.children)}</${node.tag}>`;
        })
        .join("");
}
function escape(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
