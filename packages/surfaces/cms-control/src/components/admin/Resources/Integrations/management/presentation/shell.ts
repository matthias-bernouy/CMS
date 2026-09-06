import styles from "./style.css" with { type: "text" };

export function renderManagementShell(
    host: HTMLElement,
    deploymentStatus: string,
    panel: string,
    select: (panel: string) => void,
): void {
    const style = document.createElement("style");
    style.textContent = styles;
    const nav = document.createElement("nav");
    nav.className = "management-tabs";
    nav.setAttribute("aria-label", "Source settings");
    for (const [id, label] of [
        ["connection", "Connection"],
        ["health", "Health"],
    ] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.panel = id;
        button.setAttribute("aria-pressed", String(id === panel));
        button.addEventListener("click", () => select(id));
        nav.append(button);
    }
    const deployment = document.createElement("p");
    deployment.textContent = `Deployment: ${deploymentStatus}`;
    const status = document.createElement("p");
    status.className = "management-status";
    status.dataset.managementStatus = "";
    status.setAttribute("role", "status");
    const content = document.createElement("div");
    content.dataset.managementContent = "";
    host.replaceChildren(style, nav, deployment, status, content);
}
