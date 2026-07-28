import { showRepositoryError } from "../render/feedback";

export function renderRepositoryFailure(feedback: HTMLElement, error: unknown): void {
    if (!isAbortError(error)) {
        showRepositoryError(feedback, error);
    }
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
