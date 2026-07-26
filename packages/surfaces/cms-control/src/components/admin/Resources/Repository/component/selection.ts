import type { RepositoryVersionSelection } from "../contracts/types";

export function renderRepositorySelection(host: ParentNode, selection: RepositoryVersionSelection): void {
    query(host, "[data-actions-panel]").hidden = false;
    query(host, "[data-selection-title]").textContent = `${selection.kind}@${selection.version}`;
    query(host, "[data-action-selection]").textContent =
        `${selection.kind}@${selection.version} · compatibility ${selection.currentReportRevisionId} · decision ${selection.decision?.revisionId ?? "unavailable"}`;
    query(host, "[data-confirm-version]").textContent = selection.version;
    query(host, "[data-confirm-report]").textContent = selection.decision?.revisionId ?? "unavailable";
    query(host, "[data-block-confirm-version]").textContent = selection.version;
    query(host, "[data-block-confirm-digest]").textContent = selection.decision?.digest ?? "unavailable";
    query(host, "[data-block-preview]").textContent = blockPreview(selection);
    query<HTMLFieldSetElement>(host, "[data-promotion-form] fieldset").disabled =
        !selection.decision?.admissible || selection.status !== "installable";
    query<HTMLFieldSetElement>(host, "[data-block-form] fieldset").disabled =
        !selection.decision || selection.status === "blocked";
    query<HTMLFormElement>(host, "[data-promotion-form]").reset();
    query<HTMLFormElement>(host, "[data-block-form]").reset();
}

function blockPreview(selection: RepositoryVersionSelection): string {
    if (!selection.blockPreview) {
        return "Channel repair preview unavailable.";
    }
    const current = selection.blockPreview.current;
    const next = selection.blockPreview.next;
    return `Blocking repairs stable ${current.stable ?? "unset"} → ${next.stable ?? "unset"} and latest ${current.latest ?? "unset"} → ${next.latest ?? "unset"}. Exact downloads and pinned reruns remain available.`;
}

function query<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) {
        throw new Error(`Missing repository selection element ${selector}`);
    }
    return node;
}
