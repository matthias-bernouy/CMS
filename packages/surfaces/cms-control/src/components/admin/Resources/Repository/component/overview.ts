import { fetchRepositoryDiagnostics, fetchRepositoryStatus } from "../api";
import { renderRepositoryDiagnostics } from "../render/diagnostics";
import { clearFeedback, showFeedback, showRepositoryError } from "../render/feedback";
import { renderRepositoryStatus } from "../render/status";

export async function reloadRepositoryOverview(host: ParentNode, signal: AbortSignal): Promise<void> {
    const feedback = query(host, "[data-overview-feedback]");
    clearFeedback(feedback);
    try {
        const [status, diagnostics] = await Promise.all([
            fetchRepositoryStatus(signal),
            fetchRepositoryDiagnostics(signal),
        ]);
        renderRepositoryStatus(query(host, "[data-status]"), status);
        renderRepositoryDiagnostics(query(host, "[data-diagnostics]"), diagnostics);
        showFeedback(feedback, `Repository health: ${status.health}.`, status.ready ? "success" : "info");
    } catch (error) {
        if (!isAbortError(error)) {
            showRepositoryError(feedback, error);
        }
    }
}

function query(root: ParentNode, selector: string): HTMLElement {
    const node = root.querySelector<HTMLElement>(selector);
    if (!node) {
        throw new Error(`Missing repository overview element ${selector}`);
    }
    return node;
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
