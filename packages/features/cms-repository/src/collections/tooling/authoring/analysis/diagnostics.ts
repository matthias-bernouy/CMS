import { analyzeExpandedPageDocument } from "@bernouy/cms-content/page-document";
import type { ContentDiagnostic } from "@bernouy/cms-content/page-document";
import type { CollectionRelease } from "cms-repository/collections/interfaces/CollectionRelease";
import { collectionDocumentDefinitions } from "cms-repository/collections/core/parsing/documents/definitions";
import { collectionExampleDocument } from "cms-repository/collections/core/validation/examples/document";
import { blocDesignFingerprint } from "./fingerprint";
import { nearBlocDiagnostics } from "./similarity";

/** Preparation-only feedback. Advisory reports are not immutable release data. */
export function collectionAuthoringDiagnostics(release: CollectionRelease): readonly ContentDiagnostic[] {
    const diagnostics: ContentDiagnostic[] = [];
    const definitions = collectionDocumentDefinitions(release.blocs);
    for (const example of release.examples ?? []) {
        const html = collectionExampleDocument(release, example.id).html;
        const analysis = analyzeExpandedPageDocument(html, definitions, false);
        for (const diagnostic of analysis.diagnostics) {
            if (diagnostic.severity === "error" && diagnostics.length < 32) {
                diagnostics.push({
                    ...diagnostic,
                    location: {
                        ...diagnostic.location,
                        path: `examples/${example.id}/document.html${diagnostic.location?.path ?? ""}`,
                    },
                });
            }
        }
    }
    const groups = new Map<string, string[]>();
    const descriptors = [];
    for (const bloc of release.blocs) {
        const descriptor = blocDesignFingerprint(bloc);
        if (descriptor) {
            descriptors.push(descriptor);
            groups.set(descriptor.fingerprint, [...(groups.get(descriptor.fingerprint) ?? []), bloc.id]);
        }
    }
    for (const group of groups.values()) {
        if (group.length > 1 && diagnostics.length < 32) {
            diagnostics.push({
                code: "design.similar_blocs",
                severity: "warning",
                message: `${group.length} Blocs share normalized markup, native/slot contracts and styles. Their public names may differ; review whether one reusable structure would be clearer.`,
                relatedResources: group.slice(0, 8),
                suggestion:
                    "Compare the listed Blocs and their consumers before sharing a structure; distinct editorial intent can justify separate resources.",
            });
        }
    }
    diagnostics.push(...nearBlocDiagnostics(descriptors));
    const ordered = diagnostics
        .filter((value) => value.severity === "error")
        .concat(diagnostics.filter((value) => value.severity === "warning"));
    return ordered.length <= 16
        ? ordered
        : [
              ...ordered.slice(0, 15),
              {
                  code: "analysis.truncated",
                  severity: "warning",
                  message: "Additional diagnostics were omitted. Correct the reported issues and prepare again.",
              },
          ];
}
