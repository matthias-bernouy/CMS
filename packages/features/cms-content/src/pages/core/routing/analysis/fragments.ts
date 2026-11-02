import { analyzeExpandedPageDocument } from "cms-content/blocs/core/markup/validation/documents/expandedPageDocument";
import { dynamicValue } from "cms-content/blocs/core/markup/validation/documents/expanded/context";
import type { ContentDiagnostic } from "cms-content/application/interfaces/diagnostics";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { linkIssue } from "./collect";
import type { PageDocumentLink } from "./collect";

type Analysis = ReturnType<typeof analyzeExpandedPageDocument>;
type FragmentIndex = { ids: Set<string>; conditional: Set<string>; dynamic: boolean };

/** Retain only ID indexes, with a shared node/text budget across all linked Pages. */
export function fragmentReader(source: Analysis) {
    const indexes = new Map<string, FragmentIndex | null>();
    let nodes = 0,
        characters = 0;
    return (link: PageDocumentLink, target: TPage, severity: ContentDiagnostic["severity"]): ContentDiagnostic[] => {
        if (!indexes.has(target.id)) {
            let index: FragmentIndex | null = null;
            try {
                if (nodes >= 50_000 || characters >= 4 * 1024 * 1024) {
                    throw new Error("Fragment analysis budget exceeded");
                }
                const analysis = analyzeExpandedPageDocument(target.content, source.definitions, false);
                nodes += analysis.context.elements.length;
                characters += analysis.root.innerHTML.length;
                if (nodes <= 50_000 && characters <= 4 * 1024 * 1024) {
                    index = { ids: new Set(), conditional: new Set(), dynamic: false };
                    for (const element of analysis.context.elements) {
                        if (!element.id) {
                            continue;
                        }
                        index.dynamic ||= dynamicValue(element.id);
                        index.ids.add(element.id);
                        const state = analysis.context.presence.get(element)!;
                        if (state.branches.size || state.conditions.size || state.repeated) {
                            index.conditional.add(element.id);
                        }
                    }
                }
            } catch {
                index = null;
            }
            indexes.set(target.id, index);
        }
        const index = indexes.get(target.id);
        if (!index) {
            return [
                linkIssue(
                    link,
                    "page.fragment_unverified",
                    "warning",
                    "The destination fragment could not be verified within the bounded document analysis.",
                ),
            ];
        }
        if (!index.ids.has(link.fragment!)) {
            return [missingFragment(link, index.dynamic, severity)];
        }
        return index.conditional.has(link.fragment!) ? [conditionalFragment(link)] : [];
    };
}

export function localFragmentDiagnostics(
    link: PageDocumentLink,
    analysis: Analysis,
    severity: ContentDiagnostic["severity"],
): ContentDiagnostic[] {
    const targets = analysis.context.elements.filter(
        (element) => element.id === link.fragment && analysis.context.coexist(link.element, element),
    );
    if (!targets.length) {
        return [
            missingFragment(
                link,
                analysis.context.elements.some((element) => dynamicValue(element.id)),
                severity,
            ),
        ];
    }
    return targets.some((target) => analysis.context.certain(link.element, target)) ? [] : [conditionalFragment(link)];
}

function missingFragment(
    link: PageDocumentLink,
    dynamic: boolean,
    severity: ContentDiagnostic["severity"],
): ContentDiagnostic {
    return linkIssue(
        link,
        dynamic ? "page.fragment_unverified" : "page.fragment_missing",
        dynamic ? "warning" : severity,
        `The fragment ${JSON.stringify(link.fragment!.slice(0, 160))} ${dynamic ? "may depend on a runtime ID and was not verified" : "has no target in the destination document"}.`,
    );
}

function conditionalFragment(link: PageDocumentLink): ContentDiagnostic {
    return linkIssue(
        link,
        "page.fragment_conditional",
        "warning",
        "The destination fragment depends on runtime conditions or repetition and may be unavailable.",
    );
}
