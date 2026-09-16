import { languageOption, offeredLanguages, sortLanguages } from "./catalogue";

export type LanguageSelection = {
    defaultLanguage: string;
    additionalLanguages: ReadonlySet<string>;
    activeLanguages: ReadonlySet<string>;
};

export function renderLanguageSettings(host: HTMLElement, selection: LanguageSelection): void {
    const selected = new Set(selection.additionalLanguages);
    if (selection.defaultLanguage) {
        selected.add(selection.defaultLanguage);
    }
    const selectedCodes = sortLanguages(selected);
    const selectedKeys = new Set([...selected].map((code) => code.toLowerCase()));
    const availableCodes = sortLanguages(
        offeredLanguages.map(({ code }) => code).filter((code) => !selectedKeys.has(code.toLowerCase())),
    );

    host.querySelector<HTMLElement>("[data-selected-count]")!.textContent = String(selectedCodes.length);
    host.querySelector<HTMLElement>("[data-available-count]")!.textContent = String(availableCodes.length);
    host.querySelector<HTMLElement>("[data-selected-empty]")!.hidden = selectedCodes.length > 0;
    host.querySelector<HTMLElement>("[data-default-setting]")!.hidden = selectedCodes.length === 0;
    const defaultSelect = host.querySelector<HTMLElement>("[data-default-select]")!;
    defaultSelect.replaceChildren(
        ...selectedCodes.map((code) => {
            const option = host.ownerDocument.createElement("option");
            option.value = code;
            option.textContent = languageOption(code).label;
            option.selected = code === selection.defaultLanguage;
            return option;
        }),
    );
    defaultSelect.setAttribute("value", selection.defaultLanguage);
    host.querySelector<HTMLElement>("[data-selected-list]")!.replaceChildren(
        ...selectedCodes.map((code) => languageRow(host.ownerDocument, code, selection)),
    );
    host.querySelector<HTMLElement>("[data-available-list]")!.replaceChildren(
        ...availableCodes.map((code) => languageRow(host.ownerDocument, code, selection, true)),
    );
}

function languageRow(document: Document, code: string, selection: LanguageSelection, available = false): HTMLElement {
    const option = languageOption(code);
    const isDefault = code.toLowerCase() === selection.defaultLanguage.toLowerCase();
    const isActive = selection.activeLanguages.has(code);
    const row = document.createElement("div");
    row.className = "language-row";
    const identity = document.createElement("div");
    identity.className = "language-identity";
    const flag = document.createElement("span");
    flag.className = "language-flag";
    flag.setAttribute("aria-hidden", "true");
    flag.textContent = option.flag;
    const name = document.createElement("span");
    name.className = "language-name";
    const title = document.createElement("span");
    title.className = "language-title";
    const label = document.createElement("strong");
    label.textContent = option.label;
    title.append(label);
    if (!available && isDefault) {
        const badge = document.createElement("p9r-badge");
        badge.setAttribute("color", "success");
        badge.textContent = "Default";
        title.append(badge);
    }
    name.append(title);
    if (option.nativeName && option.nativeName !== option.label) {
        const nativeName = document.createElement("small");
        nativeName.textContent = option.nativeName;
        name.append(nativeName);
    }
    identity.append(flag, name);
    row.append(identity);

    const actions = document.createElement("div");
    actions.className = "language-actions";
    if (available) {
        actions.append(actionButton(document, code, "add", selection.defaultLanguage ? "Add" : "Use as default"));
    } else if (!isDefault) {
        const status = document.createElement("span");
        status.className = "language-status-control";
        const badge = document.createElement("p9r-badge");
        if (isActive) {
            badge.setAttribute("color", "success");
        }
        badge.textContent = isActive ? "Active" : "Draft";
        const activeSwitch = document.createElement("w13c-switch");
        activeSwitch.setAttribute("color", "success");
        activeSwitch.dataset.languageCode = code;
        activeSwitch.setAttribute(
            "aria-label",
            `${isActive ? "Set" : "Activate"} ${option.label}${isActive ? " to draft" : ""}`,
        );
        activeSwitch.toggleAttribute("checked", isActive);
        status.append(badge, activeSwitch);
        actions.append(status, removeButton(document, code));
    }
    if (actions.childElementCount > 0) {
        row.append(actions);
    }
    return row;
}

function actionButton(document: Document, code: string, action: string, label: string): HTMLElement {
    const button = document.createElement("p9r-button");
    button.setAttribute("type", "button");
    button.setAttribute("variant", "outlined");
    button.dataset.languageAction = action;
    button.dataset.languageCode = code;
    button.setAttribute("aria-label", `${label} ${languageOption(code).label}`);
    button.textContent = label;
    return button;
}

function removeButton(document: Document, code: string): HTMLElement {
    const button = document.createElement("p9r-icon-button");
    button.setAttribute("type", "button");
    button.setAttribute("variant", "ghost");
    button.setAttribute("size", "sm");
    button.setAttribute("aria-label", `Remove ${languageOption(code).label}`);
    button.dataset.languageAction = "remove";
    button.dataset.languageCode = code;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
    return button;
}
