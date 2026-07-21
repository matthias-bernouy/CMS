import type { TopBar } from "../../TopBar/TopBar";
import type { EditorV2PageConfig } from "../Shell";

export function openPageSettingsModal(modal: HTMLElement): void {
    modal.hidden = false;
    modal.querySelector<HTMLInputElement>("input")?.focus();
}

export function closePageSettingsModal(modal: HTMLElement): void {
    modal.hidden = true;
}

export function syncPageSettingsForm(
    config: EditorV2PageConfig | null,
    pageField: <T extends HTMLElement>(name: string) => T,
): void {
    if (!config) {
        return;
    }
    pageField<HTMLInputElement>("title").value = config.title;
    pageField<HTMLInputElement>("path").value = config.path;
    pageField<HTMLSelectElement>("published").value = String(config.published);
    pageField<HTMLTextAreaElement>("description").value = config.description;
    pageField<HTMLInputElement>("tags").value = config.tags.join(", ");
}

export function readPageSettingsForm(
    config: EditorV2PageConfig | null,
    pageField: <T extends HTMLElement>(name: string) => T,
): EditorV2PageConfig | null {
    if (!config) {
        return null;
    }
    return {
        id: config.id,
        title: pageField<HTMLInputElement>("title").value.trim(),
        path: pageField<HTMLInputElement>("path").value.trim(),
        published: pageField<HTMLSelectElement>("published").value === "true",
        description: pageField<HTMLTextAreaElement>("description").value,
        tags: parseTags(pageField<HTMLInputElement>("tags").value),
    };
}

export function applyPageSettingsTitle(topBar: TopBar, config: EditorV2PageConfig | null): void {
    if (config) {
        topBar.setPageTitle(config.title, config.path);
    }
}

export function parseTags(value: string): string[] {
    return [
        ...new Set(
            value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
        ),
    ];
}
