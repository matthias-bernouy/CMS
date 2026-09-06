import type { IntegrationInstallationRow } from "../../Integrations/model";
import { route } from "../api";

export async function loadSourceInstallations(): Promise<IntegrationInstallationRow[]> {
    const response = await fetch(route("/api/integrations/installations"));
    if (!response.ok) {
        throw new Error(`Unable to load source settings (HTTP ${response.status})`);
    }
    return response.json() as Promise<IntegrationInstallationRow[]>;
}
export function renderSourceManagement(
    menu: HTMLElement,
    source: string,
    installations: IntegrationInstallationRow[],
): void {
    const parent = installations.find((item) => item.sourceIds?.includes(source));
    if (!parent) {
        return;
    }
    const related = [parent, ...installations.filter((item) => item.extensionOf?.kind === parent.id)];
    let anchor = Array.from(menu.children)
        .filter((item) => item instanceof HTMLElement && item.dataset.source === source)
        .at(-1);
    for (const item of related) {
        const link = document.createElement("w13c-lateral-menu-item");
        link.dataset.generated = "true";
        link.setAttribute("manual-active", "");
        link.toggleAttribute("active", new URL(window.location.href).searchParams.get("integration") === item.id);
        link.classList.add("dashboard-item");
        link.setAttribute(
            "href",
            route(`/admin/sources?source=${encodeURIComponent(source)}&integration=${encodeURIComponent(item.id)}`),
        );
        link.textContent = item === parent ? "Settings & health" : `${item.label} settings`;
        if (anchor) {
            anchor.after(link);
        } else {
            menu.append(link);
        }
        anchor = link;
    }
}
export function sourceForInstallation(id: string, installations: IntegrationInstallationRow[]): string | undefined {
    const item = installations.find((item) => item.id === id);
    return (
        item?.sourceIds?.[0] ?? installations.find((parent) => parent.id === item?.extensionOf?.kind)?.sourceIds?.[0]
    );
}
