import type { IntegrationBrowserHost, IntegrationDefinition, IntegrationInstallationDetail } from "../model";

export type ReconfigureState = {
    detail: IntegrationInstallationDetail | null;
    definition: IntegrationDefinition | null;
    loadToken: number;
    pending: boolean;
    disabledControls: Array<[HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, boolean]>;
};

const states = new WeakMap<IntegrationBrowserHost, ReconfigureState>();

export function stateFor(host: IntegrationBrowserHost): ReconfigureState {
    let state = states.get(host);
    if (!state) {
        state = { detail: null, definition: null, loadToken: 0, pending: false, disabledControls: [] };
        states.set(host, state);
    }
    return state;
}
