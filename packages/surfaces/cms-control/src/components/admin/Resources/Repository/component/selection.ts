import type { RepositoryVersionSelection } from "../contracts/types";

export function renderRepositorySelection(host: ParentNode, selection: RepositoryVersionSelection): void {
    query(host, "[data-actions-panel]").hidden = false;
    query(host, "[data-selection-title]").textContent = `${selection.kind}@${selection.version}`;
    query(host, "[data-action-selection]").textContent =
        `${selection.kind}@${selection.version} · current report ${selection.currentReportRevisionId}`;
    query(host, "[data-confirm-version]").textContent = selection.version;
    query(host, "[data-confirm-report]").textContent = selection.currentReportRevisionId;
    query<HTMLFormElement>(host, "[data-promotion-form]").reset();
}

function query<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) {
        throw new Error(`Missing repository selection element ${selector}`);
    }
    return node;
}
