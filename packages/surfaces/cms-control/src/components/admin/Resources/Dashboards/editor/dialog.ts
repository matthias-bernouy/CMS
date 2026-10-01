import type { AvailableView, NavigationItem } from "../domain/types";

type ValueControl = HTMLElement & { value: string };

export type NavigationItemDraft = {
    kind: "group" | "view";
    label: string;
    icon: string;
    use?: string;
    placement: "lateral" | "tabs";
};

export function fillItemDialog(
    root: HTMLElement,
    item: NavigationItem,
    path: number[],
    views: AvailableView[],
    used: Set<string>,
    allowGroup: boolean,
): void {
    const current = item.use ?? "";
    const select = field(root, "[data-view]");
    select.replaceChildren(
        ...views.map((view) => {
            const option = document.createElement("option");
            option.value = `${view.collectionId}:${view.viewId}`;
            option.textContent = `${view.collectionName} / ${view.name}`;
            option.disabled = option.value !== current && used.has(option.value);
            return option;
        }),
    );
    const terminal = !allowGroup;
    setField(root, "[data-kind]", item.use || terminal ? "view" : "group");
    root.querySelector<HTMLElement>("[data-kind-field]")!.hidden = terminal;
    const available = select.querySelector<HTMLOptionElement>("option:not(:disabled)")?.value ?? "";
    setField(root, "[data-view]", current || available);
    setField(root, "[data-label]", item.label);
    setField(root, "[data-icon]", item.icon ?? "layout");
    setField(root, "[data-placement]", path.length === 2 ? "tabs" : (item.childPlacement ?? "lateral"));
    field(root, "[data-placement]").toggleAttribute("disabled", path.length >= 2);
    root.querySelector<HTMLElement>("[data-placement-field]")!.hidden = path.length >= 3 || !item.children?.length;
    syncItemKind(root);
}

export function readItemDialog(root: HTMLElement): NavigationItemDraft | null {
    const kind = field(root, "[data-kind]").value === "group" ? "group" : "view";
    const label = field(root, "[data-label]").value.trim();
    const use = field(root, "[data-view]").value;
    if (!label || label.length > 32 || (kind === "view" && !use)) {
        return null;
    }
    return {
        kind,
        label,
        icon: field(root, "[data-icon]").value,
        ...(kind === "view" ? { use } : {}),
        placement: field(root, "[data-placement]").value === "tabs" ? "tabs" : "lateral",
    };
}

export function syncItemKind(root: HTMLElement): void {
    const view = field(root, "[data-view]");
    const isView = field(root, "[data-kind]").value === "view";
    view.toggleAttribute("disabled", !isView);
    root.querySelector<HTMLElement>("[data-view-field]")!.hidden = !isView;
}

function field(root: HTMLElement, selector: string): ValueControl {
    return root.querySelector(selector) as ValueControl;
}

function setField(root: HTMLElement, selector: string, value: string): void {
    const control = field(root, selector);
    control.setAttribute("value", value);
    control.value = value;
}
