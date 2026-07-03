import type { WDetailData } from "./types";
import { actionIcon } from "./icons";

type DetailAction = WDetailData["actions"][number];

export function renderDetailActions(actions: WDetailData["actions"]): HTMLElement[] {
    const result = actions.slice(0, 3).map(renderButton);
    if (actions.length > 3) result.push(renderOverflowMenu(actions.slice(3)));
    return result;
}

function renderButton(action: DetailAction): HTMLElement {
    const button = document.createElement("p9r-button");
    button.setAttribute("type", "button");
    if (action.tone === "primary") button.setAttribute("color", "primary");
    else if (action.tone === "danger") {
        button.setAttribute("color", "danger");
        button.setAttribute("variant", "ghost");
    } else button.setAttribute("variant", "outlined");
    button.dataset.action = action.action ?? action.label;
    button.textContent = action.label;
    return button;
}

function renderOverflowMenu(actions: DetailAction[]): HTMLElement {
    const menu = document.createElement("p9r-action-menu");
    menu.setAttribute("label", "More actions");
    for (const [label, sectionActions] of groupedSections(actions)) {
        const section = document.createElement("p9r-action-menu-section");
        section.setAttribute("label", label);
        for (const action of sectionActions) section.append(renderMenuItem(action));
        menu.append(section);
    }
    return menu;
}

function renderMenuItem(action: DetailAction): HTMLElement {
    const item = document.createElement("p9r-action-menu-item");
    if (action.tone === "danger") item.setAttribute("color", "danger");
    item.dataset.action = action.action ?? action.label;
    const icon = actionIcon(action.icon);
    if (icon) item.append(icon);
    item.append(document.createTextNode(action.label));
    return item;
}

function groupedSections(actions: DetailAction[]): Array<[string, DetailAction[]]> {
    const sections = new Map<string, DetailAction[]>();
    for (const action of actions) {
        const label = action.section ?? "Other actions";
        sections.set(label, [...(sections.get(label) ?? []), action]);
    }
    return Array.from(sections);
}
