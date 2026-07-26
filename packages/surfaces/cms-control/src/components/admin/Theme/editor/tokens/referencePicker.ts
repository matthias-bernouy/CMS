import type { ThemeDefinition, ThemeMode, ThemeSettings } from "@bernouy/cms-content";

import { isIntegrationSource } from "../../ownership";
import {
    canReferenceThemeToken,
    compatibleTokenOwners,
    compatibleTokenTypes,
    directTokenReference,
    effectiveTokenValue,
    resolveThemeTokenValue,
    themeTokenEntries,
} from "./values";

export type ReferencePickerState = {
    settings: ThemeSettings;
    theme: ThemeDefinition;
    mode: ThemeMode;
    tokenId?: string;
    search: string;
};

export function renderTokenReferencePicker(root: ShadowRoot, state: ReferencePickerState): void {
    const panel = root.querySelector<HTMLElement>("[data-reference-picker]");
    if (!panel) {
        return;
    }
    panel.hidden = !state.tokenId;
    setBackgroundInert(root, Boolean(state.tokenId));
    if (!state.tokenId) {
        return;
    }
    const entries = themeTokenEntries(state.settings);
    const current = entries.find((entry) => entry.token.id === state.tokenId);
    if (!current) {
        panel.hidden = true;
        return;
    }
    root.querySelector<HTMLElement>("[data-reference-picker-title]")!.textContent = `Link ${current.token.label}`;
    const search = root.querySelector<HTMLInputElement>("[data-reference-search]")!;
    if (search.value !== state.search) {
        search.value = state.search;
    }
    const query = state.search.trim().toLowerCase();
    const candidates = entries.filter((entry) => {
        const haystack = [
            entry.token.label,
            entry.token.variable,
            entry.token.description,
            entry.category.label,
            entry.source.label,
        ]
            .join(" ")
            .toLowerCase();
        return (
            entry.token.id !== current.token.id &&
            compatibleTokenTypes(current.token, entry.token) &&
            compatibleTokenOwners(current, entry) &&
            (!query || haystack.includes(query))
        );
    });
    const groups = groupBySource(candidates);
    const list = root.querySelector<HTMLElement>("[data-reference-results]")!;
    list.replaceChildren(...groups.map(([sourceId, sourceEntries]) => sourceGroup(sourceId, sourceEntries, state)));
    root.querySelector<HTMLElement>("[data-reference-empty]")!.hidden = candidates.length > 0;
}

function setBackgroundInert(root: ShadowRoot, inert: boolean): void {
    for (const element of Array.from(
        root.querySelectorAll<HTMLElement>("cms-shell-detail > :not([data-reference-picker])"),
    )) {
        element.inert = inert;
    }
}

function groupBySource(entries: ReturnType<typeof themeTokenEntries>): [string, typeof entries][] {
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
        const group = groups.get(entry.source.id) ?? [];
        group.push(entry);
        groups.set(entry.source.id, group);
    }
    return [...groups.entries()];
}

function sourceGroup(
    sourceId: string,
    entries: ReturnType<typeof themeTokenEntries>,
    state: ReferencePickerState,
): HTMLElement {
    const group = document.createElement("section");
    group.className = "reference-group";
    group.dataset.referenceSource = sourceId;
    const heading = document.createElement("h5");
    const source = entries[0]!.source;
    heading.textContent = isIntegrationSource(source) ? `${source.label} · Integration` : source.label;
    group.append(heading, ...entries.map((entry) => referenceOption(entry, state)));
    return group;
}

function referenceOption(
    entry: ReturnType<typeof themeTokenEntries>[number],
    state: ReferencePickerState,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reference-option";
    button.dataset.referenceTarget = entry.token.id;
    const allowed = canReferenceThemeToken(state.settings, state.theme, state.mode, state.tokenId!, entry.token.id);
    button.disabled = !allowed;
    const current = themeTokenEntries(state.settings).find((item) => item.token.id === state.tokenId)!;
    const selected = directTokenReference(effectiveTokenValue(current.token, state.theme, state.mode));
    button.toggleAttribute("aria-pressed", selected === entry.token.variable);

    const identity = document.createElement("span");
    identity.className = "reference-option-identity";
    const name = document.createElement("strong");
    name.textContent = entry.token.label;
    const variable = document.createElement("code");
    variable.textContent = `--${entry.token.variable}`;
    identity.append(name, variable);
    const preview = document.createElement("span");
    preview.className = "reference-option-value";
    preview.textContent = allowed
        ? resolveThemeTokenValue(state.settings, state.theme, state.mode, entry.token.id).value || "No value"
        : "Would create a circular reference";
    button.append(identity, preview);
    return button;
}
