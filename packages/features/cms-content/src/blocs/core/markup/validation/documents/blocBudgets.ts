import { ContentValidationError } from "cms-content/application/core/validation/errors";

export const BLOC_DOCUMENT_LIMITS = Object.freeze({
    maxMarkupLength: 64 * 1024,
    maxStyleCssLength: 128 * 1024,
    maxViewJsLength: 1024 * 1024,
    maxSourceFiles: 256,
    maxSourceFileLength: 1024 * 1024,
    maxSourceTotalLength: 8 * 1024 * 1024,
    maxDomNodes: 2_048,
    maxDomDepth: 64,
    maxOperations: 128,
});

export function assertBlocMarkupLength(field: string, value: string): void {
    assertLength(field, value, BLOC_DOCUMENT_LIMITS.maxMarkupLength);
}

export function assertBlocArtifactBudgets(
    viewJS: string,
    source?: Readonly<Record<string, string>>,
    styleCSS?: string,
): void {
    assertLength("viewJS", viewJS, BLOC_DOCUMENT_LIMITS.maxViewJsLength);
    if (styleCSS !== undefined) {
        assertLength("styleCSS", styleCSS, BLOC_DOCUMENT_LIMITS.maxStyleCssLength);
    }
    if (source === undefined) {
        return;
    }
    const entries = Object.entries(source);
    if (entries.length > BLOC_DOCUMENT_LIMITS.maxSourceFiles) {
        throw new ContentValidationError("source", `too many files; max ${BLOC_DOCUMENT_LIMITS.maxSourceFiles}`);
    }
    let total = 0;
    for (const [path, content] of entries) {
        if (typeof content !== "string") {
            throw new ContentValidationError("source", `file ${JSON.stringify(path)} must contain a string`);
        }
        assertLength(`source.${path}`, content, BLOC_DOCUMENT_LIMITS.maxSourceFileLength);
        total += path.length + content.length;
        if (total > BLOC_DOCUMENT_LIMITS.maxSourceTotalLength) {
            throw new ContentValidationError(
                "source",
                `bundle too long; max ${BLOC_DOCUMENT_LIMITS.maxSourceTotalLength} chars`,
            );
        }
    }
}

export function assertBlocDomBudget(field: string, root: Node): void {
    const pending = Array.from(root.childNodes, (node) => ({ node, depth: 1 }));
    let count = 0;
    while (pending.length > 0) {
        const { node, depth } = pending.pop()!;
        count += 1;
        if (count > BLOC_DOCUMENT_LIMITS.maxDomNodes) {
            throw new ContentValidationError(field, `DOM has too many nodes; max ${BLOC_DOCUMENT_LIMITS.maxDomNodes}`);
        }
        if (depth > BLOC_DOCUMENT_LIMITS.maxDomDepth) {
            throw new ContentValidationError(field, `DOM is too deep; max ${BLOC_DOCUMENT_LIMITS.maxDomDepth}`);
        }
        for (const child of Array.from(node.childNodes)) {
            pending.push({ node: child, depth: depth + 1 });
        }
    }
}

export function assertBlocOperationBudget(field: string, count: number): void {
    if (count > BLOC_DOCUMENT_LIMITS.maxOperations) {
        throw new ContentValidationError(field, `too many CMS operations; max ${BLOC_DOCUMENT_LIMITS.maxOperations}`);
    }
}

function assertLength(field: string, value: string, maximum: number): void {
    if (value.length > maximum) {
        throw new ContentValidationError(field, `too long; max ${maximum} chars`);
    }
}
