import type { EditableState, SettingSection } from "@bernouy/cms-content/editor";
import { visibleSettings } from "../settingState";
import type { SettingControlRenderer } from "./settingControls";

export function renderSettingsStates(states: EditableState[], onToggle: (state: EditableState) => void): HTMLElement {
    const section = document.createElement("cms-editor-v2-section");
    section.setAttribute("label", "States");

    for (const state of states) {
        const button = document.createElement("button");
        button.className = "state-button";
        button.type = "button";
        button.ariaPressed = String(state.isActive());

        const label = document.createElement("span");
        label.className = "state-label";
        label.textContent = state.label;

        const description = document.createElement("span");
        description.className = "state-description";
        description.textContent = state.description ?? (state.isActive() ? "Active" : "Inactive");

        button.append(label, description);
        button.addEventListener("click", () => onToggle(state));
        section.append(button);
    }

    return section;
}

export function renderSettingSection(section: SettingSection, controls: SettingControlRenderer): HTMLElement {
    const element = document.createElement("cms-editor-v2-section");
    element.setAttribute("label", section.kind === "surcharge" ? `${section.label} override` : section.label);

    const settings = visibleSettings(section.settings);
    if (settings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "section-empty";
        empty.textContent = "No settings";
        element.append(empty);
        return element;
    }

    for (const setting of settings) {
        element.append(controls.render(setting));
    }
    return element;
}
