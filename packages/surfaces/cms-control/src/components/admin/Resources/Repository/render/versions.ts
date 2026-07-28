import type { RepositoryVersionsView } from "../contracts/types";
import { element, emptyMessage } from "./dom";

export function renderRepositoryVersions(
    target: HTMLElement,
    view: RepositoryVersionsView,
    select: (version: string) => void,
): void {
    const summary = element("p");
    summary.append(
        document.createTextNode(`${view.kind} — stable `),
        element("strong", view.stable ?? "not set"),
        document.createTextNode(" · latest "),
        element("strong", view.latest ?? "not set"),
    );
    if (view.versions.length === 0) {
        target.replaceChildren(summary, emptyMessage("No published version."));
        return;
    }
    const table = element("table", undefined, "version-table");
    const head = element("tr");
    for (const label of ["Version", "Channel", "Eligibility", "Verification", "Digest", "Compatibility", "Action"]) {
        head.append(element("th", label));
    }
    const body = element("tbody");
    for (const item of view.versions) {
        const row = element("tr");
        const button = element("button", "Inspect", "secondary");
        button.type = "button";
        button.dataset.version = item.version;
        button.addEventListener("click", () => select(item.version));
        row.append(
            tableCell(item.version),
            tableCell(channels(view, item.version)),
            tableCell(eligibility(item)),
            tableCell(verification(item)),
            tableCell(item.digest ?? "Unavailable", true),
            tableCell(compatibility(item)),
            tableNode(button),
        );
        body.append(row);
    }
    const tableHead = element("thead");
    tableHead.append(head);
    table.append(tableHead, body);
    target.replaceChildren(summary, table);
}

function eligibility(item: RepositoryVersionsView["versions"][number]): string {
    if (item.status) {
        return item.status;
    }
    return item.release?.admissible ? "installable" : "unverified";
}

function verification(item: RepositoryVersionsView["versions"][number]): string {
    if (!item.release?.verificationOutcome) {
        return "No report";
    }
    return `${item.release.verificationOutcome} · ${item.release.verificationOrigin ?? "unknown origin"}`;
}

function tableCell(value: string, code = false): HTMLTableCellElement {
    const cell = element("td");
    cell.append(code ? element("code", value) : document.createTextNode(value));
    return cell;
}

function tableNode(node: Node): HTMLTableCellElement {
    const cell = element("td");
    cell.append(node);
    return cell;
}

function channels(view: RepositoryVersionsView, version: string): string {
    return (
        [view.stable === version ? "stable" : undefined, view.latest === version ? "latest" : undefined]
            .filter(Boolean)
            .join(", ") || "—"
    );
}

function compatibility(item: RepositoryVersionsView["versions"][number]): string {
    if (!item.compatibility) {
        return "No report";
    }
    return `${item.compatibility.outcome}${item.compatibility.warning ? " · warning" : ""}`;
}
