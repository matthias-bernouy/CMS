import { RepositoryApiError } from "../api";
import { RepositoryFormError } from "../forms/fields";
import { element } from "./dom";

export function clearFeedback(target: HTMLElement): void {
    target.replaceChildren();
    target.removeAttribute("data-tone");
    target.setAttribute("role", "status");
}

export function showFeedback(target: HTMLElement, message: string, tone: "error" | "info" | "success" = "info"): void {
    target.dataset.tone = tone;
    target.setAttribute("role", "status");
    target.replaceChildren(element("span", message));
}

export function showRepositoryError(target: HTMLElement, error: unknown): void {
    target.dataset.tone = "error";
    target.setAttribute("role", "alert");
    target.replaceChildren(element("strong", errorMessage(error)));
}

function errorMessage(error: unknown): string {
    if (error instanceof RepositoryFormError) {
        return error.message;
    }
    if (!(error instanceof RepositoryApiError)) {
        return "The repository returned an invalid response. Reload before retrying.";
    }
    if (isStale(error)) {
        const current = error.details.currentReportRevisionId;
        return `The selected release decision or report is stale. Reload the current evidence${current ? ` (${current})` : ""} and confirm it again.`;
    }
    if (error.status === 409) {
        return conflictMessage(error);
    }
    if (error.status === 413) {
        return "The candidate is larger than the allowed upload size.";
    }
    if (error.status === 422) {
        const outcome = error.details.report?.outcome;
        return `Release admission rejected this candidate${outcome ? ` (${outcome})` : ""}. Review compatibility, verification, and migration evidence.`;
    }
    if (error.status === 429) {
        return `Too many repository requests.${error.retryAfter ? ` Retry after ${error.retryAfter} seconds.` : " Retry later."}`;
    }
    if (error.status === 503) {
        return "Repository management is temporarily unavailable. Cached public delivery remains unaffected.";
    }
    if (error.status === 404) {
        return "Repository management is not configured for this CMS or the requested item does not exist.";
    }
    if (error.status === 400) {
        return "The repository rejected the request as invalid. Check the entered values.";
    }
    return "The repository request failed. Reload before retrying.";
}

function isStale(error: RepositoryApiError): boolean {
    return Boolean(error.details.currentReportRevisionId || error.code?.includes("stale"));
}

function conflictMessage(error: RepositoryApiError): string {
    const values = [
        error.details.existingDigest ? `Existing digest: ${error.details.existingDigest}.` : "",
        error.details.latest ? ` Latest version: ${error.details.latest}.` : "",
    ].join("");
    return `The version already exists or repository state changed. Reload before retrying.${values}`;
}
