import type { ContractSelection, ProviderDetail, ProviderList } from "./model";
import { empty, installationCard, metric, route } from "./elements";

export class ProviderView {
    constructor(private readonly root: ShadowRoot) {}

    render(list: ProviderList): void {
        this.required("[data-summary]").replaceChildren(
            metric(String(list.installations.length), "Installations"),
            metric(String(list.installations.filter(({ status }) => status === "enabled").length), "Enabled"),
            metric(String(list.selections.length), "Selected contracts"),
        );
        const target = this.required("[data-installations]");
        target.replaceChildren(...list.installations.map(installationCard));
        if (!list.installations.length) {
            target.append(empty("No provider installation has been approved."));
        }
    }

    renderRouting(list: ProviderList, details: ProviderDetail[]): void {
        const contracts = new Set(details.flatMap(({ contracts }) => contracts.map(({ contractId }) => contractId)));
        for (const selection of list.selections) {
            contracts.add(selection.contractId);
        }
        const target = this.required("[data-routing]");
        target.replaceChildren(
            ...[...contracts].sort().map((contractId) => route(contractId, details, list.selections)),
        );
        if (!contracts.size) {
            target.append(empty("No implemented contract is available for routing."));
        }
    }

    selections(): ContractSelection[] {
        const selections: ContractSelection[] = [];
        for (const select of this.root.querySelectorAll<HTMLSelectElement>("select[data-contract]")) {
            const chosen = select.selectedOptions.item(0);
            if (!chosen?.dataset.installationId || !chosen.dataset.version || !chosen.dataset.digest) {
                continue;
            }
            selections.push({
                contractId: select.dataset.contract!,
                installationId: chosen.dataset.installationId,
                version: chosen.dataset.version,
                digest: chosen.dataset.digest,
            });
        }
        return selections;
    }

    selectTab(tab: string): void {
        for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === tab));
        }
        for (const panel of this.root.querySelectorAll<HTMLElement>("[data-panel]")) {
            panel.hidden = panel.dataset.panel !== tab;
        }
    }

    setBusy(busy: boolean): void {
        this.required("[part=workspace]").setAttribute("aria-busy", String(busy));
        for (const control of this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select")) {
            if (busy) {
                control.dataset.disabledBeforeBusy = String(control.disabled);
                control.disabled = true;
            } else {
                control.disabled = control.dataset.disabledBeforeBusy === "true";
                delete control.dataset.disabledBeforeBusy;
            }
        }
    }

    notice(message: string, error = false): void {
        const notice = this.required("[data-notice]");
        notice.textContent = message;
        notice.toggleAttribute("data-error", error);
    }

    required<T extends Element = HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing provider manager element: ${selector}`);
        }
        return element;
    }
}
