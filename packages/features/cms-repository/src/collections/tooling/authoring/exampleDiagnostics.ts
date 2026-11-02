import { analyzeExpandedPageDocument } from "@bernouy/cms-content/page-document";
import type { ContentDiagnostic } from "@bernouy/cms-content/page-document";
import type { CollectionRelease } from "cms-repository/collections/interfaces/CollectionRelease";
import { collectionDocumentDefinitions } from "cms-repository/collections/core/parsing/documents/definitions";
import { collectionExampleDocument } from "cms-repository/collections/core/validation/examples/document";

/** Expanded-example validation feedback is not immutable release data. */
export function collectionAuthoringDiagnostics(release: CollectionRelease): readonly ContentDiagnostic[] {
    const diagnostics: ContentDiagnostic[] = [];
    let truncated = false;
    const definitions = collectionDocumentDefinitions(release.blocs);
    for (const example of release.examples ?? []) {
        const html = collectionExampleDocument(release, example.id).html;
        const analysis = analyzeExpandedPageDocument(html, definitions, false);
        truncated ||= analysis.diagnostics.some((diagnostic) => diagnostic.code === "analysis.truncated");
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
    return !truncated && diagnostics.length <= 16
        ? diagnostics
        : [
              ...diagnostics.slice(0, 15),
              {
                  code: "analysis.truncated",
                  severity: "warning",
                  message: "Additional diagnostics were omitted. Correct the reported issues and prepare again.",
              },
          ];
}
