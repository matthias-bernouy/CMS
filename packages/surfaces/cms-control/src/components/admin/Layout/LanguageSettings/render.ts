import { languageOption, offeredLanguages, sortLanguages } from "./catalogue";

export type LanguageSelection = {
    defaultLanguage: string;
    additionalLanguages: ReadonlySet<string>;
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
    host.querySelector<HTMLElement>("[data-selected-list]")!.replaceChildren(
        ...selectedCodes.map((code) => languageRow(host.ownerDocument, code, selection.defaultLanguage)),
    );
    host.querySelector<HTMLElement>("[data-available-list]")!.replaceChildren(
        ...availableCodes.map((code) => languageRow(host.ownerDocument, code, selection.defaultLanguage, true)),
    );
}

function languageRow(document: Document, code: string, defaultLanguage: string, available = false): HTMLElement {
    const option = languageOption(code);
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
    if (!available && code === defaultLanguage) {
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
        actions.append(actionButton(document, code, "add", defaultLanguage ? "Add" : "Use as default"));
    } else if (code !== defaultLanguage) {
        actions.append(actionButton(document, code, "default", "Make default"));
        actions.append(actionButton(document, code, "remove", "Remove"));
    }
    if (actions.childElementCount > 0) {
        row.append(actions);
    }
    return row;
}

function actionButton(document: Document, code: string, action: string, label: string): HTMLElement {
    const button = document.createElement("p9r-button");
    button.setAttribute("type", "button");
    button.setAttribute("variant", action === "remove" ? "ghost" : "outlined");
    button.dataset.languageAction = action;
    button.dataset.languageCode = code;
    button.setAttribute("aria-label", `${label} ${languageOption(code).label}`);
    button.textContent = label;
    return button;
}
