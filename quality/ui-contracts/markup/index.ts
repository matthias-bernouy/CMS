import type { UiFinding, UiSource } from "../contracts/types";
import { markupFinding } from "./findings";
import { inspectForms } from "./forms";
import { markupTags } from "./html";
import { BINDING_OWNERS } from "./owners";
import { scriptMarkup } from "./script";
import type { MarkupTag } from "./types";

export function inspectMarkup(source: UiSource): UiFinding[] {
    const tags: MarkupTag[] =
        source.kind === "html"
            ? markupTags({ content: source.content, positions: source.content.split("").map((_, index) => index) })
            : scriptMarkup(source);
    const findings: UiFinding[] = [];
    for (const tag of tags) {
        if (tag.name === "cms-binding-core") {
            const owner = BINDING_OWNERS[source.path.replaceAll("\\", "/")];
            findings.push(
                markupFinding(source, tag.offset, {
                    rule: "binding-core-owner",
                    severity: owner ? "INFO" : "ERROR",
                    message: owner ?? "A component creates a binding core outside a declared document owner.",
                    recommendation: owner
                        ? "Keep this activation root at the document boundary."
                        : "Keep binding content in light DOM, including component-owned children, under the existing document core. Use official components and shared styles; do not add a private core or component stylesheet to light DOM.",
                }),
            );
        }
        findings.push(...inspectForms(source, tag));
    }
    return findings;
}
