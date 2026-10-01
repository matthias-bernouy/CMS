import { expect, test } from "bun:test";
import type { NavigationItem } from "../../../src/components/admin/Resources/Dashboards/domain/types";
import { DashboardNavigationEditor } from "../../../src/components/admin/Resources/Dashboards/editor/NavigationEditor";
import { moveItem, navigationError } from "../../../src/components/admin/Resources/Dashboards/editor/tree";

test("navigation editor only renders the editable navigation tree", () => {
    const editor = new DashboardNavigationEditor();
    document.body.append(editor);

    expect(editor.querySelector("[data-tree]")).not.toBeNull();
    expect(editor.querySelector("[data-preview]")).toBeNull();
    expect(editor.textContent).not.toContain("Navigation preview");

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
