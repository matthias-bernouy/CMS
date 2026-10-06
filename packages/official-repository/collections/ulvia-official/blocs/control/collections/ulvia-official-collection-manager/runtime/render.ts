import type { Catalogue, CatalogueRelease, InstalledCollection, Operations, OperationalStatus } from "./model";
import { releaseAction } from "./model";

export function renderSummary(target: Element, catalogue: Catalogue, status: OperationalStatus): void {
    target.replaceChildren(
        metric(String(catalogue.installed.length), "Installed"),
        metric(String(catalogue.releases.length), "Repository releases"),
        metric(status.maintenance ? "Active" : "Ready", "Maintenance"),
    );
}

export function renderInstalled(target: Element, items: InstalledCollection[], query: string): void {
    const visible = items.filter((item) => searchable(item).includes(query));
    target.replaceChildren(
        ...visible.map((item) => {
            const itemCard = card(item.collectionId, `${item.publisherId} · ${item.version}`);
            itemCard.body.append(code(item.digest));
            itemCard.element.append(action("Configure", "configure", item.collectionId));
            return itemCard.element;
        }),
    );
    empty(
        target,
        visible.length,
        items.length ? "No installed collection matches this filter." : "No collection is installed.",
    );
}

export function renderReleases(target: Element, catalogue: Catalogue, query: string): void {
    const visible = catalogue.releases.filter((item) => searchable(item).includes(query));
    target.replaceChildren(
        ...visible.map((release) => {
            const action = releaseAction(release, catalogue.installed);
            const releaseCard = card(release.name, `${release.publisherId} · ${release.version}`);
            releaseCard.body.append(
                paragraph(release.description),
                meta(`${release.blocCount} Blocs${release.hasTheme ? " · theme included" : ""}`),
            );
            if (action === "install") {
                releaseCard.element.append(actionControl("Install", "install", release.digest, "primary"));
            } else if (action === "upgrade") {
                releaseCard.element.append(
                    actionControl("Try compatible upgrade", "upgrade", release.digest),
                    actionControl("Plan migration", "plan", release.digest, "primary"),
                );
            } else {
                releaseCard.body.append(badge(action === "current" ? "Installed" : "Historical release"));
            }
            releaseCard.body.append(code(release.digest));
            return releaseCard.element;
        }),
    );
    const message = catalogue.repositories.length
        ? "No repository release matches this filter."
        : "No collection repository is configured.";
    empty(target, visible.length, message);
}

export function renderActivity(target: Element, operations: Operations): void {
    target.replaceChildren(
        ...operations.items.map((operation) => {
            const row = document.createElement("article");
            row.setAttribute("part", "activity-row");
            const content = document.createElement("div");
            content.append(
                title(`${operation.contractId} / ${operation.capabilityId}`, 4),
                meta(`${formatDate(operation.updatedAt)}${operation.errorCode ? ` · ${operation.errorCode}` : ""}`),
            );
            row.append(content, badge(operation.status));
            return row;
        }),
    );
    empty(target, operations.items.length, "No durable operation has been recorded yet.");
}

export function setBusy(root: ShadowRoot, busy: boolean): void {
    root.querySelector<HTMLElement>('[part="workspace"]')?.setAttribute("aria-busy", String(busy));
    for (const control of root.querySelectorAll<HTMLButtonElement>("button")) {
        if (busy) {
            control.dataset.disabledBeforeBusy = String(control.disabled);
            control.disabled = true;
        } else {
            control.disabled = control.dataset.disabledBeforeBusy === "true";
            delete control.dataset.disabledBeforeBusy;
        }
    }
}

function card(name: string, subtitle: string): { element: HTMLElement; body: HTMLElement } {
    const element = document.createElement("ulvia-official-card");
    element.setAttribute("surface", "raised");
    const eyebrow = meta(subtitle);
    eyebrow.slot = "eyebrow";
    const heading = title(name, 4);
    heading.slot = "title";
    const body = document.createElement("div");
    body.slot = "body";
    element.append(eyebrow, heading, body);
    return { element, body };
}

function metric(value: string, label: string): HTMLElement {
    const item = document.createElement("div");
    item.setAttribute("part", "metric");
    item.append(title(value, 3), meta(label));
    return item;
}

function button(label: string, action: string, key: string, emphasis = "secondary"): HTMLButtonElement {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    control.dataset.action = action;
    control.dataset.key = key;
    control.dataset.emphasis = emphasis;
    return control;
}

function action(label: string, actionId: string, key: string, emphasis = "secondary"): HTMLElement {
    return actionControl(label, actionId, key, emphasis);
}

function actionControl(label: string, actionId: string, key: string, emphasis = "secondary"): HTMLElement {
    const wrapper = document.createElement("ulvia-official-action");
    wrapper.slot = "actions";
    wrapper.setAttribute("variant", emphasis === "primary" ? "filled" : "outlined");
    wrapper.setAttribute("tone", emphasis === "primary" ? "primary" : "secondary");
    wrapper.setAttribute("size", "sm");
    wrapper.append(button(label, actionId, key, emphasis));
    return wrapper;
}

function badge(value: string): HTMLElement {
    const item = document.createElement("ulvia-official-badge");
    item.setAttribute("tone", badgeTone(value));
    item.setAttribute("size", "sm");
    const label = document.createElement("span");
    label.slot = "label";
    label.textContent = value.replaceAll("-", " ");
    item.append(label);
    return item;
}

function badgeTone(value: string): string {
    if (value === "failed") {
        return "danger";
    }
    if (value === "succeeded" || value === "current") {
        return "success";
    }
    if (value === "running") {
        return "info";
    }
    return "neutral";
}

function title(value: string, level: 3 | 4): HTMLHeadingElement {
    const heading = document.createElement(`h${level}`) as HTMLHeadingElement;
    heading.textContent = value;
    return heading;
}

function paragraph(value: string): HTMLParagraphElement {
    const item = document.createElement("p");
    item.textContent = value;
    return item;
}

function meta(value: string): HTMLElement {
    const item = document.createElement("small");
    item.textContent = value;
    return item;
}

function code(value: string): HTMLElement {
    const item = document.createElement("code");
    item.textContent = value;
    return item;
}

function empty(target: Element, count: number, message: string): void {
    if (!count) {
        const item = paragraph(message);
        item.setAttribute("part", "empty");
        target.append(item);
    }
}

function searchable(item: object): string {
    return Object.values(item)
        .filter((value) => typeof value === "string")
        .join(" ")
        .toLowerCase();
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
