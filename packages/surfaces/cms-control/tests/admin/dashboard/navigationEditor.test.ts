import { expect, test } from "bun:test";
import type { NavigationItem } from "../../../src/components/admin/Resources/Dashboards/domain/types";
import { DashboardNavigationEditor } from "../../../src/components/admin/Resources/Dashboards/editor/NavigationEditor";
import {
    moveItem,
    navigationError,
    relocateItem,
    reorderItem,
} from "../../../src/components/admin/Resources/Dashboards/editor/tree";

test("navigation editor only renders the editable navigation tree", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);

    expect(editor.querySelector("[data-tree]")).not.toBeNull();
    expect(editor.querySelector("[data-preview]")).toBeNull();
    expect(editor.textContent).not.toContain("Navigation preview");

    editor.remove();
});

test("new navigation items inherit their collection view icon", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.views = [
        {
            collectionId: "test",
            collectionName: "Test",
            viewId: "overview",
            name: "Overview",
            icon: "star",
            description: "",
        },
    ];
    const modal = editor.querySelector<HTMLElement & { showModal(): void }>("[data-dialog]")!;
    modal.showModal = () => {};

    editor.querySelector<HTMLElement>("[data-add-root]")!.click();

    expect(editor.value[0]).toMatchObject({ label: "Overview", icon: "star", use: "test:overview" });
    editor.remove();
});

test("navigation editor validates direct tabs and three-level navigation", () => {
    const directTabs: NavigationItem[] = [
        {
            id: "catalog",
            label: "Catalog",
            childPlacement: "tabs",
            children: [
                { id: "products", label: "Products", use: "test:overview" },
                { id: "resources", label: "Resources", use: "test:resources" },
            ],
        },
    ];
    expect(navigationError(directTabs)).toBe("");
    directTabs[0]!.childPlacement = "lateral";
    directTabs[0]!.children![0]!.childPlacement = "tabs";
    directTabs[0]!.children![0]!.children = [{ id: "details", label: "Details", use: "test:details" }];
    expect(navigationError(directTabs)).toBe("");
});

test("navigation editor rejects empty groups and duplicate views", () => {
    expect(navigationError([{ id: "empty", label: "Empty" }])).toContain("Add a child");
    expect(
        navigationError([
            { id: "one", label: "One", use: "test:overview" },
            { id: "two", label: "Two", use: "test:overview" },
        ]),
    ).toContain("already");
});

test("moving items preserves the navigation placement invariants", () => {
    const items: NavigationItem[] = [
        { id: "one", label: "One", use: "test:overview" },
        { id: "two", label: "Two", use: "test:resources" },
    ];
    expect(moveItem(items, [1], "indent")).toBeTrue();
    expect(items).toHaveLength(1);
    expect(items[0]?.childPlacement).toBe("lateral");
    expect(items[0]?.children?.[0]?.id).toBe("two");
    expect(moveItem(items, [0, 0], "outdent")).toBeTrue();
    expect(items).toHaveLength(2);
    expect(items[0]?.children).toBeUndefined();
    expect(items[0]?.childPlacement).toBeUndefined();
});

test("drag reordering stays inside the current navigation level", () => {
    const items: NavigationItem[] = [
        { id: "one", label: "One", use: "test:one" },
        { id: "two", label: "Two", use: "test:two" },
        { id: "three", label: "Three", use: "test:three" },
    ];
    expect(reorderItem(items, [0], [2], true)).toBeTrue();
    expect(items.map((item) => item.id)).toEqual(["two", "three", "one"]);
    expect(reorderItem(items, [0], [0, 0], false)).toBeFalse();
});

test("dragging inside a primary item creates its first second-level item", () => {
    const items: NavigationItem[] = [
        { id: "overview", label: "Overview", use: "test:overview" },
        { id: "resources", label: "Resources", use: "test:resources" },
    ];

    expect(relocateItem(items, [1], [0], "inside")).toBeTrue();
    expect(items).toHaveLength(1);
    expect(items[0]?.childPlacement).toBe("lateral");
    expect(items[0]?.children?.map((item) => item.id)).toEqual(["resources"]);
    expect(navigationError(items)).toBe("");
});

test("pointer drag does not rewrite its marker and clears when it leaves the editor", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.value = [
        { id: "one", label: "One", use: "test:one" },
        { id: "two", label: "Two", use: "test:two" },
    ];
    const target = editor.querySelectorAll<HTMLElement>("[data-path]")[1]!;
    const targetRow = target.querySelector<HTMLElement>(".navigation-row")!;
    const elementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetRow });
    const originalSetAttribute = target.setAttribute.bind(target);
    let markerWrites = 0;
    target.setAttribute = (name: string, value: string) => {
        if (name === "data-drop-position") {
            markerWrites += 1;
        }
        originalSetAttribute(name, value);
    };
    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(pointerDown, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    editor.querySelectorAll<HTMLElement>("[data-drag-handle]")[0]!.dispatchEvent(pointerDown);
    const pointerMove = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.assign(pointerMove, { clientX: 10, clientY: 10, pointerId: 1 });
    document.dispatchEvent(pointerMove);
    document.dispatchEvent(pointerMove);
    expect(editor.querySelectorAll("[data-dragging]")).toHaveLength(1);
    expect(editor.querySelectorAll("[data-drop-position]")).toHaveLength(1);
    expect(markerWrites).toBe(1);

    window.dispatchEvent(new Event("blur"));
    expect(editor.querySelector("[data-dragging], [data-drop-position]")).toBeNull();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    editor.remove();
});

test("pointer drag reorders items without entering native browser drag mode", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.value = [
        { id: "one", label: "One", use: "test:one" },
        { id: "two", label: "Two", use: "test:two" },
    ];
    const targetRow = editor.querySelectorAll<HTMLElement>(".navigation-row")[1]!;
    const elementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetRow });
    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(pointerDown, { button: 0, clientX: 0, clientY: 0, pointerId: 2 });
    editor.querySelectorAll<HTMLElement>("[data-drag-handle]")[0]!.dispatchEvent(pointerDown);
    const pointerMove = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.assign(pointerMove, { clientX: 10, clientY: 10, pointerId: 2 });
    document.dispatchEvent(pointerMove);
    const pointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.assign(pointerUp, { clientX: 10, clientY: 10, pointerId: 2 });
    document.dispatchEvent(pointerUp);

    expect(editor.value.map((item) => item.id)).toEqual(["two", "one"]);
    expect(editor.querySelector("[data-dragging], [data-drop-position]")).toBeNull();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    editor.remove();
});

test("pointer drag can create a second navigation level without an existing child", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.value = [
        { id: "overview", label: "Overview", use: "test:overview" },
        { id: "resources", label: "Resources", use: "test:resources" },
    ];
    const targetRow = editor.querySelectorAll<HTMLElement>(".navigation-row")[0]!;
    targetRow.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 240, height: 60, right: 240, bottom: 60, x: 0, y: 0 }) as DOMRect;
    const elementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => targetRow });
    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(pointerDown, { button: 0, clientX: 0, clientY: 0, pointerId: 3 });
    editor.querySelectorAll<HTMLElement>("[data-drag-handle]")[1]!.dispatchEvent(pointerDown);
    const pointerMove = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.assign(pointerMove, { clientX: 120, clientY: 30, pointerId: 3 });
    document.dispatchEvent(pointerMove);
    expect(editor.querySelector('[data-drop-position="inside"]')).not.toBeNull();
    const pointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.assign(pointerUp, { clientX: 120, clientY: 30, pointerId: 3 });
    document.dispatchEvent(pointerUp);

    expect(editor.value[0]?.children?.[0]?.id).toBe("resources");
    expect(editor.value[0]?.childPlacement).toBe("lateral");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    editor.remove();
});

test("navigation row actions use shared controls without a standalone add button", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.views = [
        { collectionId: "test", collectionName: "Test", viewId: "two", name: "Two", icon: "layout", description: "" },
    ];
    editor.value = [{ id: "one", label: "One", use: "test:one" }];

    expect(editor.querySelector("p9r-icon-button[data-drag-handle]")).not.toBeNull();
    expect(editor.querySelector('.navigation-row > .navigation-actions [data-action="add-child"]')?.localName).toBe(
        "p9r-action-menu-item",
    );
    expect(editor.querySelector(".navigation-add-child")).toBeNull();
    editor.remove();
});

test("terminal navigation items can only be views", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.views = [
        { collectionId: "test", collectionName: "Test", viewId: "one", name: "One", icon: "layout", description: "" },
        { collectionId: "test", collectionName: "Test", viewId: "two", name: "Two", icon: "layout", description: "" },
    ];
    editor.value = [
        {
            id: "root",
            label: "Root",
            childPlacement: "lateral",
            children: [
                {
                    id: "side",
                    label: "Side",
                    childPlacement: "tabs",
                    children: [{ id: "one", label: "One", use: "test:one" }],
                },
            ],
        },
    ];
    const modal = editor.querySelector<HTMLElement & { showModal(): void }>("[data-dialog]")!;
    modal.showModal = () => {};

    editor.querySelector<HTMLElement>('[data-path="0.0"] > .navigation-row [data-action="add-child"]')!.click();

    expect(editor.value[0]?.children?.[0]?.children?.[1]?.use).toBe("test:two");
    expect(editor.querySelector<HTMLElement>("[data-kind-field]")!.hidden).toBeTrue();
    expect((editor.querySelector("[data-kind]") as HTMLElement & { value: string }).value).toBe("view");
    editor.remove();
});

test("terminal navigation cannot add an empty group when every view is used", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.views = [
        { collectionId: "test", collectionName: "Test", viewId: "one", name: "One", icon: "layout", description: "" },
    ];
    editor.value = [
        {
            id: "root",
            label: "Root",
            childPlacement: "lateral",
            children: [
                {
                    id: "side",
                    label: "Side",
                    childPlacement: "tabs",
                    children: [{ id: "one", label: "One", use: "test:one" }],
                },
            ],
        },
    ];

    expect(editor.querySelector('[data-path="0.0"] > .navigation-row [data-action="add-child"]')).toBeNull();
    editor.remove();
});

test("a direct tab is terminal even when another collection view is available", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);
    editor.views = [
        {
            collectionId: "test",
            collectionName: "Test",
            viewId: "one",
            name: "One",
            icon: "layout",
            description: "",
        },
        {
            collectionId: "test",
            collectionName: "Test",
            viewId: "two",
            name: "Two",
            icon: "layout",
            description: "",
        },
    ];
    editor.value = [
        {
            id: "root",
            label: "Root",
            childPlacement: "tabs",
            children: [{ id: "one", label: "One", use: "test:one" }],
        },
    ];
    const modal = editor.querySelector<HTMLElement & { showModal(): void }>("[data-dialog]")!;
    modal.showModal = () => {};

    expect(editor.querySelector('[data-path="0.0"] > .navigation-row [data-action="add-child"]')).toBeNull();
    editor.querySelector<HTMLElement>('[data-path="0.0"] > .navigation-row [data-action="edit"]')!.click();
    expect(editor.querySelector<HTMLElement>("[data-kind-field]")!.hidden).toBeTrue();
    editor.remove();
});
