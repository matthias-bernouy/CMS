import { afterEach, describe, expect, test } from "bun:test";
import { currentState, setState } from "@bernouy/components/binding";
import {
    DASHBOARD_SCHEMA_VERSION,
    type DashboardDefinition,
    type DashboardViewDefinition,
} from "@bernouy/cms-dashboards";
import {
    handleNavigationDragStart,
    handleNavigationAction,
    navigationEditor,
    serializeNavigation,
} from "cms-control/components/admin/DashboardWorkspace/workspace/navigation";
import {
    CmsDashboardCreateController,
    deriveDashboardId,
} from "cms-control/components/admin/DashboardWorkspace/configuration/CreateController";
import { CmsDashboardMemberFilter } from "cms-control/components/admin/DashboardWorkspace/configuration/MemberFilter";

if (!customElements.get("cms-dashboard-create-controller")) {
    customElements.define("cms-dashboard-create-controller", CmsDashboardCreateController);
}
if (!customElements.get("cms-dashboard-member-filter")) {
    customElements.define("cms-dashboard-member-filter", CmsDashboardMemberFilter);
}

afterEach(() => document.body.replaceChildren());

describe("dashboard workspace configuration", () => {
    test("derives a visible dashboard id", () => {
        expect(deriveDashboardId("Support équipe")).toBe("support-equipe");
        expect(deriveDashboardId("  Night / Operations  ")).toBe("night-operations");
    });

    test("generates the create form id until the user edits it", async () => {
        const form = document.createElement("form");
        form.id = "dashboard-create-test";
        form.innerHTML = `<input name="name"><input name="id">`;
        const controller = document.createElement("cms-dashboard-create-controller");
        controller.setAttribute("form", form.id);
        document.body.append(form, controller);
        await Promise.resolve();
        const name = form.elements.namedItem("name") as HTMLInputElement;
        const id = form.elements.namedItem("id") as HTMLInputElement;
        name.value = "Support équipe";
        name.dispatchEvent(new Event("input", { bubbles: true }));
        expect(id.value).toBe("support-equipe");
        id.value = "support-manual";
        id.dispatchEvent(new Event("input", { bubbles: true }));
        name.value = "Different name";
        name.dispatchEvent(new Event("input", { bubbles: true }));
        expect(id.value).toBe("support-manual");
    });

    test("serializes views only from the navigation editor", () => {
        const form = document.createElement("form");
        form.append(navigationEditor(dashboard(), views()));
        document.body.append(form);
        expect(serializeNavigation(form)).toEqual([
            { id: "orders", label: "Orders", icon: "receipt", use: "commerce/orders" },
        ]);
    });

    test("edits, nests, and serializes navigation without exceeding three levels", () => {
        const form = document.createElement("form");
        const editor = navigationEditor(dashboard(), views());
        form.append(editor);
        document.body.append(form);
        const root = form.querySelector<HTMLElement>("[data-navigation-node]")!;
        expect(root.querySelector("p9r-input, p9r-select")).toBeNull();
        root.dataset.navigationLabel = "Customer orders";
        root.dataset.navigationIcon = "shopping-bag";
        const addChild = root.querySelector<HTMLElement>("[data-navigation-action='add-child']")!;
        expect(handleNavigationAction(addChild, views()).handled).toBeTrue();
        const child = root.querySelector<HTMLElement>("[data-navigation-children] > [data-navigation-node]")!;
        expect(child.dataset.depth).toBe("2");
        expect(child.querySelector("[data-navigation-action='add-child']")).not.toBeNull();
        handleNavigationAction(child.querySelector("[data-navigation-action='add-child']")!, views());
        const grandchild = child.querySelector<HTMLElement>("[data-navigation-children] > [data-navigation-node]")!;
        expect(grandchild.dataset.depth).toBe("3");
        expect(grandchild.querySelector("[data-navigation-action='add-child']")).toBeNull();
        root.dataset.navigationKind = "group";
        const serialized = serializeNavigation(form)[0]!;
        expect(serialized).toMatchObject({
            label: "Customer orders",
            icon: "shopping-bag",
            children: [{ children: [{ use: "commerce/orders" }] }],
        });
        expect(serialized).not.toHaveProperty("use");
    });

    test("uses the complete navigation row as the native drag preview", () => {
        const host = document.createElement("div");
        const root = host.attachShadow({ mode: "open" });
        root.append(navigationEditor(dashboard(), views()));
        document.body.append(host);
        const handle = root.querySelector<HTMLElement>("[data-navigation-drag-handle]")!;
        const row = root.querySelector<HTMLElement>(".dashboard-navigation-row")!;
        row.getBoundingClientRect = () => ({
            x: 10,
            y: 20,
            left: 10,
            top: 20,
            right: 310,
            bottom: 80,
            width: 300,
            height: 60,
            toJSON: () => ({}),
        });
        let preview: { element: Element; x: number; y: number } | undefined;
        const dataTransfer = {
            effectAllowed: "none",
            setData: () => undefined,
            setDragImage: (element: Element, x: number, y: number) => {
                preview = { element, x, y };
            },
        };

        handleNavigationDragStart(root, {
            clientX: 30,
            clientY: 45,
            composedPath: () => [handle],
            dataTransfer,
        } as unknown as DragEvent);

        expect(preview).toEqual({ element: row, x: 20, y: 25 });
        expect(dataTransfer.effectAllowed).toBe("move");
    });

    test("drives server-side dashboard member search and pagination from light DOM", async () => {
        const filter = document.createElement("cms-dashboard-member-filter");
        filter.innerHTML = `
            <input data-dashboard-member-search>
            <button data-dashboard-member-pagination></button>
            <div data-dashboard-member-row>Existing</div>
            <p data-dashboard-member-no-results hidden>No results</p>`;
        document.body.append(filter);
        await Promise.resolve();
        setState("dashboard-member-page", "3");
        const input = filter.querySelector<HTMLInputElement>("[data-dashboard-member-search]")!;
        input.value = "AVAILABLE@EXAMPLE.COM";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(currentState("dashboard-member-page")).toBe("1");
        filter
            .querySelector("[data-dashboard-member-pagination]")!
            .dispatchEvent(new CustomEvent("page-change", { bubbles: true, detail: { page: 2 } }));
        expect(currentState("dashboard-member-page")).toBe("2");
        filter.querySelector("[data-dashboard-member-row]")?.remove();
        await Promise.resolve();
        expect(filter.querySelector("[data-dashboard-member-no-results]")?.hasAttribute("hidden")).toBeFalse();
    });
});

function views(): DashboardViewDefinition[] {
    return [
        {
            schemaVersion: DASHBOARD_SCHEMA_VERSION,
            id: "commerce/orders",
            source: "commerce",
            meta: { name: "Orders", icon: "receipt" },
            view: { id: "orders", label: "Integration label", widgets: [] },
        },
    ];
}

function dashboard(): DashboardDefinition {
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: "support",
        meta: { name: "Support", icon: "users" },
        homeView: "orders",
        views: [{ id: "orders", label: "Orders", icon: "receipt", use: "commerce/orders" }],
        origin: { kind: "site", createdBy: "admin-1" },
        status: "draft",
        revision: "1",
    };
}
