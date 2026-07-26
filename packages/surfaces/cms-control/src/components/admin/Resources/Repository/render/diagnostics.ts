import type { RepositoryDiagnosticsView, RepositoryDiagnosticView } from "../contracts/types";
import { element, emptyMessage, metadata } from "./dom";

export function renderRepositoryDiagnostics(target: HTMLElement, view: RepositoryDiagnosticsView): void {
    const fragment = document.createDocumentFragment();
    fragment.append(element("h3", "Diagnostics"));
    if (view.diagnostics.length === 0) {
        fragment.append(emptyMessage("No active diagnostics."));
    } else {
        fragment.append(...view.diagnostics.map(diagnostic));
    }
    fragment.append(element("h3", "Quarantine"));
    if (view.quarantined.length === 0) {
        fragment.append(emptyMessage("No quarantined integration."));
    } else {
        for (const entry of view.quarantined) {
            const node = element("div", undefined, "quarantine");
            node.append(
                element("strong", entry.kind ?? "Unknown integration"),
                metadata([entry.diagnosticCodes.join(", ")]),
            );
            fragment.append(node);
        }
    }
    fragment.append(element("h3", "Recovery"));
    if (view.recovery.length === 0) {
        fragment.append(emptyMessage("No recovery event."));
    } else {
        fragment.append(...view.recovery.map(diagnostic));
    }
    target.replaceChildren(fragment);
}

function diagnostic(value: RepositoryDiagnosticView): HTMLElement {
    const node = element("div", undefined, "diagnostic");
    node.append(
        element("strong", value.code),
        element("p", value.message),
        metadata([value.stage, value.kind, value.version, value.operationId]),
    );
    return node;
}
