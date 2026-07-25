import type { SignupLegalConsentViewState } from "./view";

const ACCEPTED_VERSION_IDS_FIELD = "acceptedLegalDocumentVersionIds";

export function syncSignupLegalFormValue(input: {
    internals: ElementInternals;
    state: SignupLegalConsentViewState;
    checkboxes: readonly HTMLInputElement[];
    disabled: boolean;
    loadingMessage: string;
    errorMessage: string;
    requiredMessage: string;
}): void {
    const selected = selectedVersionIds(input.checkboxes);
    if (input.disabled) {
        input.internals.setFormValue(null, serializeIds(selected));
        input.internals.setValidity({});
        return;
    }
    if (input.state.kind === "empty") {
        input.internals.setFormValue(null, "[]");
        input.internals.setValidity({});
        return;
    }
    if (input.state.kind !== "ready") {
        input.internals.setFormValue(null, "[]");
        const message = input.state.kind === "loading" ? input.loadingMessage : input.errorMessage;
        input.internals.setValidity({ customError: true }, message);
        return;
    }
    if (selected.size === input.state.documents.length) {
        const value = new FormData();
        for (const document of input.state.documents) {
            value.append(ACCEPTED_VERSION_IDS_FIELD, document.versionId);
        }
        input.internals.setFormValue(value, serializeIds(selected));
        input.internals.setValidity({});
        return;
    }

    input.internals.setFormValue(null, serializeIds(selected));
    const firstUnchecked = input.checkboxes.find((checkbox) => !checkbox.checked);
    input.internals.setValidity({ valueMissing: true }, input.requiredMessage, firstUnchecked);
}

export function selectedVersionIds(checkboxes: readonly HTMLInputElement[]): Set<string> {
    return new Set(
        checkboxes
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => checkbox.dataset.versionId)
            .filter((value): value is string => Boolean(value)),
    );
}

export function applySelectedVersionIds(checkboxes: readonly HTMLInputElement[], ids: readonly string[]): void {
    const selected = new Set(ids);
    for (const checkbox of checkboxes) {
        checkbox.checked = selected.has(checkbox.dataset.versionId ?? "");
    }
}

export function restoredVersionIds(state: string | File | FormData): string[] {
    if (typeof state !== "string") {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(state);
        return Array.isArray(parsed) && parsed.every((value) => typeof value === "string") ? parsed : [];
    } catch {
        return [];
    }
}

function serializeIds(ids: ReadonlySet<string>): string {
    return JSON.stringify([...ids]);
}
