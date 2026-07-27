import type { IntegrationBrowserHost } from "../model";

export function modal(host: IntegrationBrowserHost): HTMLElement {
    return host.query("[data-reconfigure-modal]");
}

export function fields(host: IntegrationBrowserHost): HTMLElement {
    return host.query("[data-reconfigure-fields]");
}

export function submitButton(host: IntegrationBrowserHost): HTMLElement & { disabled: boolean } {
    return host.query("[data-reconfigure-submit]");
}

export function setLoadingContent(host: IntegrationBrowserHost): void {
    const loading = document.createElement("p");
    loading.className = "empty";
    loading.textContent = "Loading saved configuration…";
    fields(host).replaceChildren(loading);
}

export function setStatus(host: IntegrationBrowserHost, value: string, error = false): void {
    const status = host.query<HTMLElement>("[data-reconfigure-status]");
    status.textContent = value;
    status.classList.toggle("is-error", error);
}

export function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
}
