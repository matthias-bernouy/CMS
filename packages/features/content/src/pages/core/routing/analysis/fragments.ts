import type { analyzeExpandedPageDocument } from "content/blocs/core/markup/validation/documents/expandedPageDocument";
import { dynamicValue } from "content/blocs/core/markup/validation/documents/expanded/context";
import type { ContentDiagnostic } from "content/application/interfaces/diagnostics";
import type { TPage } from "content/pages/interfaces/pages";
import { linkIssue } from "./collect";
import type { PageDocumentLink } from "./collect";
import { PageFragmentIndexCache } from "./fragmentIndexCache";
import type { FragmentIndex } from "./fragmentIndexCache";

type Analysis = ReturnType<typeof analyzeExpandedPageDocument>;

/** Retain only ID indexes, with a shared node/text budget across all linked Pages. */
export function fragmentReader(source: Analysis, shared = new PageFragmentIndexCache(source.definitions)) {
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
                const loaded = shared.read(target, source.definitions);
                nodes += loaded.nodes;
                characters += loaded.characters;
                if (nodes <= 50_000 && characters <= 4 * 1024 * 1024) {
                    index = loaded.index;
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
        if (!index.hasId(link.fragment!)) {
            return [missingFragment(link, index.dynamic, severity)];
        }
        return index.isConditional(link.fragment!) ? [conditionalFragment(link)] : [];
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
