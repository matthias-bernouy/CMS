import type { DashboardViewDefinition } from "@bernouy/cms-dashboards";
import { appendIconOptions, syncNavigationNode } from "./view";

type ValueControl = HTMLElement & { value: string };
type ModalControl = HTMLElement & { hide(): void; showModal(): void };
type NavigationForm = HTMLFormElement & {
    navigationCreated?: boolean;
    navigationNode?: HTMLElement;
};
type NavigationItemType = "group" | "view";

export function openNavigationItemEditor(
    root: ShadowRoot,
    node: HTMLElement,
    views: DashboardViewDefinition[],
    created = false,
): void {
    const form = navigationForm(root);
    const view = views.find((candidate) => candidate.id === node.dataset.navigationUse);
    const type: NavigationItemType = node.dataset.navigationKind === "group" ? "group" : "view";
    form.navigationNode = node;
    form.navigationCreated = created;
    setValue(form.querySelector<ValueControl>("[data-navigation-label]")!, node.dataset.navigationLabel ?? "");
    const label = form.querySelector<ValueControl>("[data-navigation-label]")!;
    label.dataset.suggestedLabel = node.dataset.suggestedLabel ?? view?.meta.name ?? "";
    const icon = form.querySelector<ValueControl>("[data-navigation-icon]")!;
    appendIconOptions(icon, node.dataset.navigationIcon ?? "layout");
    icon.dataset.suggestedIcon = node.dataset.suggestedIcon ?? view?.meta.icon ?? "layout";
    appendViewOptions(form.querySelector<ValueControl>("[data-navigation-view]")!, views, node.dataset.navigationUse);
    appendTypeOptions(
        form.querySelector<ValueControl>("[data-navigation-type]")!,
        type,
        Number(node.dataset.depth ?? "1") < 3,
    );
    syncNavigationItemType(form, type, views);
    root.querySelector<HTMLElement>("[data-action='delete-navigation-item']")!.hidden = created;
    root.querySelector<ModalControl>("[data-navigation-item-dialog]")!.showModal();
    label.focus();
}

export function saveNavigationItemEditor(root: ShadowRoot, views: DashboardViewDefinition[]): void {
    const form = navigationForm(root);
    const node = form.navigationNode;
    if (!node) {
        return;
    }
    const label = form.querySelector<ValueControl>("[data-navigation-label]")!.value.trim();
    if (!label) {
        return;
    }
    const type = form.querySelector<ValueControl>("[data-navigation-type]")!.value as NavigationItemType;
    const use = type === "view" ? form.querySelector<ValueControl>("[data-navigation-view]")!.value : "";
    if (type === "view" && !use) {
        return;
    }
    node.dataset.navigationLabel = label;
    node.dataset.navigationIcon = form.querySelector<ValueControl>("[data-navigation-icon]")!.value;
    node.dataset.navigationKind = type;
    node.dataset.navigationUse = use;
    syncNavigationNode(node, views);
    resetEditor(form);
    root.querySelector<ModalControl>("[data-navigation-item-dialog]")!.hide();
}

export function closeNavigationItemEditor(root: ShadowRoot): void {
    const form = navigationForm(root);
    discardCreatedNode(form);
    resetEditor(form);
    root.querySelector<ModalControl>("[data-navigation-item-dialog]")!.hide();
}

export function deleteNavigationItem(root: ShadowRoot): void {
    const form = navigationForm(root);
    form.navigationNode?.remove();
    resetEditor(form);
    root.querySelector<ModalControl>("[data-navigation-item-dialog]")!.hide();
}

export function handleNavigationItemEditorClosed(root: ShadowRoot): void {
    const form = navigationForm(root);
    discardCreatedNode(form);
    resetEditor(form);
}

export function syncNavigationItemType(
    form: HTMLElement,
    type: NavigationItemType,
    views: DashboardViewDefinition[],
): void {
    const field = form.querySelector<HTMLElement>("[data-navigation-view-field]")!;
    const select = form.querySelector<ValueControl>("[data-navigation-view]")!;
    const isView = type === "view";
    field.hidden = !isView;
    select.toggleAttribute("disabled", !isView);
    select.toggleAttribute("required", isView);
    if (isView && !select.value && views[0]) {
        setValue(select, views[0].id);
    }
}

function appendViewOptions(select: ValueControl, views: DashboardViewDefinition[], selected = ""): void {
    const value = views.some((view) => view.id === selected) ? selected : (views[0]?.id ?? "");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a view";
    placeholder.disabled = true;
    placeholder.selected = !value;
    select.replaceChildren(
        placeholder,
        ...views.map((view) => {
            const option = document.createElement("option");
            option.value = view.id;
            option.textContent = `${view.meta.name} · ${view.source}`;
            option.selected = view.id === value;
            return option;
        }),
    );
    setValue(select, value);
}

function appendTypeOptions(control: ValueControl, selected: NavigationItemType, allowGroup: boolean): void {
    const view = document.createElement("option");
    view.value = "view";
    view.textContent = "View";
    const group = document.createElement("option");
    group.value = "group";
    group.textContent = "Group";
    const value = allowGroup ? selected : "view";
    control.replaceChildren(view, ...(allowGroup ? [group] : []));
    setValue(control, value);
}

function navigationForm(root: ShadowRoot): NavigationForm {
    return root.querySelector<NavigationForm>("[data-navigation-item-form]")!;
}

function discardCreatedNode(form: NavigationForm): void {
    if (form.navigationCreated) {
        form.navigationNode?.remove();
    }
}

function resetEditor(form: NavigationForm): void {
    form.navigationCreated = false;
    form.navigationNode = undefined;
}

function setValue(control: ValueControl, value: string): void {
    control.setAttribute("value", value);
    control.value = value;
}
