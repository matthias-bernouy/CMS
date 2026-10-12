import { profileFor, sourceFor, tokenValue, type ThemeMode, type ThemeSettings, type ThemeToken } from "./model";

export type ThemeSelection = { collectionId: string; profileId: string; mode: ThemeMode; tokenId: string };

export function renderTheme(root: ShadowRoot, settings: ThemeSettings, selection: ThemeSelection): void {
    const source = sourceFor(settings, selection.collectionId);
    const empty = required<HTMLElement>(root, "[data-empty]");
    const editor = required<HTMLElement>(root, "[data-editor]");
    empty.hidden = Boolean(source?.categories.length);
    editor.hidden = !source?.categories.length;
    renderProfiles(root, settings, selection.profileId);
    if (!source) {
        return;
    }
    const profile = profileFor(settings, selection.profileId);
    const tokens = source.categories.flatMap((category) => category.tokens);
    const token = tokens.find(({ id }) => id === selection.tokenId) ?? tokens[0];
    if (!profile || !token) {
        return;
    }
    selection.profileId = profile.id;
    selection.tokenId = token.id;
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
        button.setAttribute("aria-pressed", String(button.dataset.mode === selection.mode));
    }
    required(root, "[data-status]").textContent =
        profile.id === settings.activeThemeId ? "Active theme" : "Draft theme";
    required<HTMLButtonElement>(root, '[data-action="activate"]').disabled = profile.id === settings.activeThemeId;
    renderCategories(required(root, "[data-categories]"), source.categories, selection.tokenId);
    renderPreview(
        required(root, "[data-preview]"),
        source.categories.flatMap((category) => category.tokens),
        profile,
        selection,
    );
    renderInspector(required(root, "[data-inspector]"), settings, profile, token, selection.mode);
}

function renderProfiles(root: ShadowRoot, settings: ThemeSettings, selected: string): void {
    const select = required<HTMLSelectElement>(root, "[data-profile]");
    select.replaceChildren(
        ...settings.themes.map((profile) => {
            const item = document.createElement("option");
            item.value = profile.id;
            item.textContent = profile.name;
            item.selected = profile.id === selected;
            return item;
        }),
    );
}

function renderCategories(
    target: Element,
    categories: ThemeSettings["sources"][number]["categories"],
    selected: string,
): void {
    target.replaceChildren(
        ...categories.map((category) => {
            const section = document.createElement("section");
            const title = document.createElement("strong");
            title.textContent = category.label;
            const list = document.createElement("div");
            for (const token of category.tokens) {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.token = token.id;
                button.dataset.searchValue = `${token.label} ${token.id}`.toLowerCase();
                button.textContent = token.label;
                setCurrent(button, token.id === selected);
                list.append(button);
            }
            section.append(title, list);
            return section;
        }),
    );
}

function renderPreview(
    target: Element,
    tokens: ThemeToken[],
    profile: ThemeSettings["themes"][number],
    selection: ThemeSelection,
): void {
    target.replaceChildren(
        ...tokens.map((token) => {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.token = token.id;
            setCurrent(button, token.id === selection.tokenId);
            const sample = document.createElement("span");
            sample.dataset.type = token.type;
            sample.style.setProperty("--token-value", tokenValue(profile, token, selection.mode));
            const label = document.createElement("strong");
            label.textContent = token.label;
            const value = document.createElement("code");
            value.textContent = tokenValue(profile, token, selection.mode) || "Not set";
            button.append(sample, label, value);
            return button;
        }),
    );
}

function setCurrent(element: Element, current: boolean): void {
    if (current) {
        element.setAttribute("aria-current", "page");
    } else {
        element.removeAttribute("aria-current");
    }
}

function renderInspector(
    target: Element,
    settings: ThemeSettings,
    profile: ThemeSettings["themes"][number],
    token: ThemeToken,
    mode: ThemeMode,
): void {
    const value = tokenValue(profile, token, mode);
    const overridden = Object.hasOwn(profile.values[mode] ?? {}, token.id);
    const heading = document.createElement("h3");
    heading.textContent = token.label;
    const description = document.createElement("p");
    description.textContent = token.description || "No description provided.";
    const variable = document.createElement("code");
    variable.textContent = `--${token.variable}`;
    const form = document.createElement("form");
    form.dataset.form = "token";
    const label = document.createElement("label");
    label.textContent = `${mode === "dark" ? "Dark" : "Light"} value`;
    const input = document.createElement("input");
    input.name = "value";
    input.dataset.tokenValue = "";
    input.value = value;
    input.required = true;
    input.setAttribute("list", "theme-token-references");
    const references = document.createElement("datalist");
    references.id = "theme-token-references";
    for (const candidate of settings.sources.flatMap((source) =>
        source.categories.flatMap((category) => category.tokens),
    )) {
        if (candidate.type === token.type && candidate.id !== token.id) {
            const option = document.createElement("option");
            option.value = `var(--${candidate.variable})`;
            option.label = candidate.label;
            references.append(option);
        }
    }
    const actions = document.createElement("div");
    actions.setAttribute("part", "inspector-actions");
    actions.append(actionButton("Reset", "reset-token", !overridden), actionButton("Save value", "save-token"));
    label.append(input);
    form.append(label, references, actions);
    target.replaceChildren(heading, description, variable, form);
}

function actionButton(label: string, action: string, disabled = false): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = action === "save-token" ? "submit" : "button";
    button.dataset.action = action;
    button.textContent = label;
    button.disabled = disabled;
    return button;
}

export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Missing collection theme element: ${selector}`);
    }
    return element;
}
