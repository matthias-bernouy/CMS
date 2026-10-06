import type { ContractSelection, ProviderDetail, ProviderInstallation } from "./model";

export function installationCard(item: ProviderInstallation): HTMLElement {
    const card = document.createElement("ulvia-official-card");
    card.setAttribute("surface", "raised");
    const eyebrow = text("small", `${item.providerId} · ${item.accountId}`);
    eyebrow.slot = "eyebrow";
    const title = text("h3", item.id);
    title.slot = "title";
    const body = document.createElement("div");
    body.slot = "body";
    body.setAttribute("part", "card-body");
    body.append(
        text("span", item.endpoint),
        text("small", `Manifest ${item.manifestVersion} · revision ${item.revision}`),
    );
    const status = badge(item.status);
    status.slot = "footer";
    const actions = document.createElement("div");
    actions.slot = "actions";
    actions.setAttribute("part", "card-actions");
    if (item.status === "enabled") {
        actions.append(action("Disable", "disable", item, "secondary"));
    } else if (item.status === "disabled") {
        actions.append(action("Enable", "enable", item, "primary"));
    }
    if (item.status !== "revoked") {
        actions.append(action("Revoke", "revoke", item, "danger"));
    }
    card.append(eyebrow, title, body, status, actions);
    return card;
}

export function route(contractId: string, details: ProviderDetail[], current: ContractSelection[]): HTMLElement {
    const row = document.createElement("div");
    row.setAttribute("part", "route");
    const label = document.createElement("label");
    const selectId = `provider-route-${contractId.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;
    label.htmlFor = selectId;
    label.append(text("span", contractId), text("code", "Choose an exact immutable release"));
    const wrapper = document.createElement("ulvia-official-select");
    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.contract = contractId;
    select.append(option("Not selected"));
    const selected = current.find((item) => item.contractId === contractId);
    for (const detail of details) {
        for (const contract of detail.contracts.filter((item) => item.contractId === contractId)) {
            if (contract.status !== "ready" && contract.digest !== selected?.digest) {
                continue;
            }
            const item = option(
                `${detail.providerId} / ${detail.accountId} · ${contract.version}${contract.status === "ready" ? "" : " · unavailable"}`,
            );
            item.dataset.installationId = detail.id;
            item.dataset.version = contract.version;
            item.dataset.digest = contract.digest;
            item.selected = selected?.installationId === detail.id && selected.digest === contract.digest;
            select.append(item);
        }
    }
    wrapper.append(select);
    row.append(label, wrapper);
    return row;
}

export function metric(value: string, label: string): HTMLElement {
    const item = document.createElement("div");
    item.setAttribute("part", "metric");
    item.append(text("strong", value), text("small", label));
    return item;
}

export function empty(message: string): HTMLElement {
    const item = text("p", message);
    item.setAttribute("part", "empty");
    return item;
}

function action(label: string, actionId: string, item: ProviderInstallation, tone: string): HTMLElement {
    const wrapper = document.createElement("ulvia-official-action");
    wrapper.setAttribute("variant", tone === "primary" ? "filled" : "outline");
    wrapper.setAttribute("tone", tone);
    wrapper.setAttribute("size", "sm");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = actionId;
    button.dataset.key = item.id;
    button.dataset.revision = String(item.revision);
    wrapper.append(button);
    return wrapper;
}

function badge(value: string): HTMLElement {
    const item = document.createElement("ulvia-official-badge");
    item.setAttribute("tone", value === "enabled" ? "success" : value === "revoked" ? "danger" : "neutral");
    item.setAttribute("size", "sm");
    const label = text("span", value);
    label.slot = "label";
    item.append(label);
    return item;
}

function option(label: string): HTMLOptionElement {
    const item = document.createElement("option");
    item.textContent = label;
    return item;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string): HTMLElementTagNameMap[K] {
    const item = document.createElement(tag);
    item.textContent = value;
    return item;
}
