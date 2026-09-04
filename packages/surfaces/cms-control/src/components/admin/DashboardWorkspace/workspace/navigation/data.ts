import type { DashboardViewDefinition, DashboardViewMount } from "@bernouy/cms-dashboards";

export function serializeNavigation(root: ParentNode): DashboardViewMount[] {
    const tree = root.querySelector<HTMLElement>("[data-navigation-tree]");
    return tree ? serializeList(tree) : [];
}

export function suggestedMount(view: DashboardViewDefinition): DashboardViewMount {
    return {
        id: slug(view.view.id || view.meta.name),
        label: view.meta.name,
        icon: view.meta.icon ?? view.view.icon ?? "layout",
        use: view.id,
    };
}

function serializeList(list: HTMLElement): DashboardViewMount[] {
    const used = new Set<string>();
    return Array.from(list.children)
        .filter(
            (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.navigationNode === "true",
        )
        .map((node) => {
            const label = (node.dataset.navigationLabel ?? "").trim();
            const icon = node.dataset.navigationIcon ?? "layout";
            const use = node.dataset.navigationKind === "group" ? "" : (node.dataset.navigationUse ?? "");
            const children = serializeList(node.querySelector<HTMLElement>("[data-navigation-children]")!);
            const id = uniqueId(node.dataset.nodeId || slug(label || use), used);
            return { id, label, icon, ...(use ? { use } : {}), ...(children.length ? { children } : {}) };
        });
}

function uniqueId(value: string, used: Set<string>): string {
    const base = slug(value);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
        candidate = `${base.slice(0, 60)}-${suffix++}`;
    }
    used.add(candidate);
    return candidate;
}

function slug(value: string): string {
    return (
        value
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64)
            .replace(/-$/g, "") || "item"
    );
}
