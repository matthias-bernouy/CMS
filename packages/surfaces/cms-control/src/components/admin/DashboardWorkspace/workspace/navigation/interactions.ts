import type { DashboardViewDefinition } from "@bernouy/cms-dashboards";
import { syncNavigationItemType } from "./editor";
import { newNavigationNode } from "./view";

type ValueControl = HTMLElement & { value: string };

export type NavigationActionResult = {
    handled: boolean;
    created?: HTMLElement;
};

export function handleNavigationAction(target: Element, views: DashboardViewDefinition[]): NavigationActionResult {
    const button = target.closest<HTMLElement>("[data-navigation-action]");
    if (!button) {
        return { handled: false };
    }
    const action = button.dataset.navigationAction;
    const node = button.closest<HTMLElement>("[data-navigation-node]");
    const list = node?.parentElement;
    if (action === "add-root") {
        const tree = button.closest("cms-detail-section")?.querySelector<HTMLElement>("[data-navigation-tree]");
        const created = newNavigationNode(views, 1);
        tree?.append(created);
        return { handled: true, ...(tree ? { created } : {}) };
    }
    if (action === "add-child" && node) {
        const depth = Number(node.dataset.depth ?? "1") + 1;
        const created = newNavigationNode(views, depth);
        node.querySelector<HTMLElement>("[data-navigation-children]")?.append(created);
        return { handled: true, created };
    }
    if (action === "remove" && node) {
        node.remove();
    } else if (action === "up" && node && node.previousElementSibling) {
        list?.insertBefore(node, node.previousElementSibling);
    } else if (action === "down" && node && node.nextElementSibling) {
        list?.insertBefore(node.nextElementSibling, node);
    }
    return { handled: true };
}

export function handleNavigationEditorChange(control: Element, views: DashboardViewDefinition[]): boolean {
    if (!control.matches("[data-navigation-type], [data-navigation-view]")) {
        return false;
    }
    const form = control.closest<HTMLElement>("[data-navigation-item-form]");
    if (!form) {
        return true;
    }
    if (control.matches("[data-navigation-type]")) {
        const type = (control as ValueControl).value === "group" ? "group" : "view";
        syncNavigationItemType(form, type, views);
        if (type === "group") {
            return true;
        }
    }
    const select = form.querySelector<ValueControl>("[data-navigation-view]")!;
    const view = views.find((candidate) => candidate.id === select.value);
    const label = form?.querySelector<ValueControl>("[data-navigation-label]");
    const icon = form?.querySelector<ValueControl>("[data-navigation-icon]");
    if (!view || !label || !icon) {
        return true;
    }
    if (!label.value || label.value === label.dataset.suggestedLabel) {
        label.value = view.meta.name;
        label.dataset.suggestedLabel = view.meta.name;
    }
    const suggestedIcon = view.meta.icon ?? view.view.icon ?? "layout";
    if (!icon.value || icon.value === icon.dataset.suggestedIcon) {
        icon.value = suggestedIcon;
        icon.dataset.suggestedIcon = suggestedIcon;
    }
    return true;
}
