import { getIntegrationInstallation, rerunIntegrationInstallation } from "../api";
import { collectReconfigureAnswers, renderFields } from "../fields";
import type { IntegrationBrowserHost } from "../model";
import { definitionFor } from "../ui/browser";
import { renderDetail } from "../ui/detail";
import { stateFor } from "./state";
import { errorMessage, fields, modal, setLoadingContent, setStatus, submitButton } from "./view";

export async function openIntegrationReconfigure(host: IntegrationBrowserHost): Promise<void> {
    const installation = host.installations.find((item) => item.id === host.selectedIntegrationId);
    if (!installation) {
        return;
    }
    const state = stateFor(host);
    const token = ++state.loadToken;
    state.detail = null;
    state.definition = null;
    setStatus(host, "Loading saved configuration…");
    setLoadingContent(host);
    setActionPending(host, false);
    submitButton(host).disabled = true;
    host.query<HTMLElement>("[data-reconfigure-title]").textContent = `Reconfigure ${installation.label}`;
    modal(host).setAttribute("open", "");

    try {
        const detail = await getIntegrationInstallation(installation.id);
        if (token !== state.loadToken || !modal(host).hasAttribute("open")) {
            return;
        }
        const definition = definitionFor(host, installation) ?? detail.definition;
        if (!definition) {
            throw new Error("The installed integration definition is unavailable.");
        }
        state.detail = detail;
        state.definition = definition;
        renderFields(fields(host), host.query("[data-field-template]"), definition, detail.answers, {
            mode: "reconfigure",
            secretInputs: detail.secretInputs,
        });
        setStatus(host, "Existing secrets can stay blank. Any newly required secret must be provided.");
        submitButton(host).disabled = false;
        queueMicrotask(() =>
            fields(host).querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled)")?.focus(),
        );
    } catch (error) {
        if (token !== state.loadToken) {
            return;
        }
        setStatus(host, errorMessage(error, "Configuration could not be loaded."), true);
    }
}

export async function submitIntegrationReconfigure(host: IntegrationBrowserHost, event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-reconfigure-form]")) {
        return;
    }
    event.preventDefault();
    const state = stateFor(host);
    if (state.pending || !state.detail || !state.definition || !form.reportValidity()) {
        return;
    }
    const token = state.loadToken;
    try {
        const answers = collectReconfigureAnswers(
            fields(host),
            state.definition,
            state.detail.secretInputs,
            state.detail.answers,
        );
        setActionPending(host, true);
        setStatus(host, "Saving configuration and syncing resources…");
        await rerunIntegrationInstallation(state.detail.id, answers);
        document.dispatchEvent(new Event("integration:reconfigured", { bubbles: true }));
        if (token !== state.loadToken) {
            return;
        }
        closeIntegrationReconfigure(host);
        renderDetail(host);
    } catch (error) {
        if (token !== state.loadToken) {
            return;
        }
        setActionPending(host, false);
        setStatus(host, errorMessage(error, "Reconfiguration failed."), true);
    }
}

export function closeIntegrationReconfigure(host: IntegrationBrowserHost): void {
    clearReconfigure(host);
    modal(host).removeAttribute("open");
}

export function handleReconfigureModalClose(host: IntegrationBrowserHost, event: Event): void {
    if (event.target !== modal(host)) {
        return;
    }
    if (stateFor(host).pending) {
        modal(host).setAttribute("open", "");
        return;
    }
    clearReconfigure(host);
}

function setActionPending(host: IntegrationBrowserHost, pending: boolean): void {
    const state = stateFor(host);
    state.pending = pending;
    const controls = Array.from(
        fields(host).querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
            "input, select, textarea, button",
        ),
    );
    if (pending) {
        state.disabledControls = controls.map((control) => [control, control.disabled]);
        for (const control of controls) {
            control.disabled = true;
        }
    } else {
        for (const [control, disabled] of state.disabledControls) {
            control.disabled = disabled;
        }
        state.disabledControls = [];
    }
    submitButton(host).disabled = pending || !state.detail;
    submitButton(host).toggleAttribute("aria-busy", pending);
    host.query<HTMLElement>("[data-reconfigure-cancel]").toggleAttribute("disabled", pending);
    modal(host).toggleAttribute("no-close", pending);
}

function clearReconfigure(host: IntegrationBrowserHost): void {
    const state = stateFor(host);
    state.loadToken++;
    state.detail = null;
    state.definition = null;
    setActionPending(host, false);
    fields(host).replaceChildren();
    setStatus(host, "");
}
