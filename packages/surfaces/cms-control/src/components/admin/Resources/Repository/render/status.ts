import type { RepositoryStatusView } from "../contracts/types";
import { labelledValue } from "./dom";

export function renderRepositoryStatus(target: HTMLElement, status: RepositoryStatusView): void {
    target.replaceChildren(
        labelledValue("Health", status.health),
        labelledValue("Ready", status.ready ? "Yes" : "No"),
        labelledValue("Integrations", String(status.integrations)),
        labelledValue("Versions", String(status.versions)),
        labelledValue("Diagnostics", String(status.diagnostics)),
        labelledValue("Quarantined", String(status.quarantined)),
        labelledValue("Recovery events", String(status.recoveryDiagnostics)),
    );
}
