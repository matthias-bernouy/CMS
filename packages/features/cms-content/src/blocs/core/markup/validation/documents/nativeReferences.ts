import { ContentValidationError } from "cms-content/application/core/validation/errors";

/** Validates static native relationships that must resolve inside one authored document. */
export function validateNativeDocumentReferences(document: Document, field: string): void {
    const ids = new Map<string, Element>();
    for (const element of Array.from(document.body.querySelectorAll("[id]"))) {
        const id = element.getAttribute("id") ?? "";
        if (/\{\{|#\{|@\{/u.test(id)) {
            continue;
        }
        if (ids.has(id)) {
            throw new ContentValidationError(field, `duplicate static native id ${JSON.stringify(id)}`);
        }
        ids.set(id, element);
    }

    for (const button of Array.from(document.body.querySelectorAll("button[commandfor]"))) {
        const targetId = button.getAttribute("commandfor") ?? "";
        const target = ids.get(targetId);
        if (!target) {
            throw new ContentValidationError(
                field,
                `native button commandfor references missing id ${JSON.stringify(targetId)}`,
            );
        }
        if (target.localName.toLowerCase() !== "dialog") {
            throw new ContentValidationError(field, `native button commandfor target must be a <dialog>`);
        }
        validateCommandDialogName(target, ids, field);
    }
}

function validateCommandDialogName(target: Element, ids: ReadonlyMap<string, Element>, field: string): void {
    if (target.getAttribute("aria-label")?.trim()) {
        return;
    }
    const labelledBy = target.getAttribute("aria-labelledby")?.trim().split(/\s+/u).filter(Boolean) ?? [];
    if (labelledBy.length === 0) {
        throw new ContentValidationError(field, "a command-targeted native <dialog> requires an accessible name");
    }
    const missing = labelledBy.find((id) => !ids.has(id));
    if (missing) {
        throw new ContentValidationError(
            field,
            `native dialog aria-labelledby references missing id ${JSON.stringify(missing)}`,
        );
    }
}
