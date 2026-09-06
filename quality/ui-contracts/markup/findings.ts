import type { UiFinding, UiSource } from "../contracts/types";

export function markupFinding(
    source: UiSource,
    offset: number,
    details: Pick<UiFinding, "rule" | "severity" | "message" | "recommendation">,
): UiFinding {
    const preceding = source.content.slice(0, offset);
    const lineStart = preceding.lastIndexOf("\n") + 1;
    const lineEnd = source.content.indexOf("\n", offset);
    return {
        ...details,
        file: source.path,
        line: preceding.split("\n").length,
        column: offset - lineStart + 1,
        evidence: source.content
            .slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
            .trim()
            .slice(0, 240),
    };
}
