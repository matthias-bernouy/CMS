import {
    Editor,
    describe,
    expect,
    installDom,
    test,
    type EditorStructureNode,
    type EditorCatalogEntry,
    type StructureTreeActionDetail,
} from "../../support/shellTestSupport";

class TestEditor extends Editor {}

describe("Structure tree accessibility", () => {
    test("opens row actions from keyboard and moves siblings with focus restored", async () => {
        installDom();
        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");
        const first = node("First", new TestEditor(document.createElement("demo-first")));
        const second = node("Second", new TestEditor(document.createElement("demo-second")));
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setStructure([first, second], second.editor);

        const actionButtons = tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".row-actions");
        expect(actionButtons).toHaveLength(2);
        expect(actionButtons[1]?.getAttribute("aria-label")).toBe("Actions for Second");
        expect(actionButtons[1]?.getAttribute("aria-haspopup")).toBe("menu");
        const styles = tree.shadowRoot!.querySelector("style")!.textContent;
        expect(styles).toContain(".row:hover > .row-actions");
        expect(styles).toContain(".row:focus-within > .row-actions");
        expect(styles).toContain(".item.selected + .row-actions");
        expect(styles).toContain("visibility: hidden");
        actionButtons[1]?.click();
        expect(contextLabels(tree)).toContain("Move up");
        tree.controller.emitter.closeContextMenu();

        const selected = tree.shadowRoot!.querySelector<HTMLButtonElement>(".item.selected")!;
        selected.dispatchEvent(keyEvent("F10", true));
        expect(contextLabels(tree)).toContain("Move down");
        tree.controller.emitter.closeContextMenu();
        selected.dispatchEvent(keyEvent("ContextMenu"));
        expect(contextLabels(tree)).toContain("Move up");

        let action: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            action = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });
        let selectedFocusCount = 0;
        const originalFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function focus(): void {
            if (this.classList.contains("selected")) {
                selectedFocusCount += 1;
            }
            originalFocus.call(this);
        };

        try {
            tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".context-item")[4]?.click();
            expect(action?.action).toBe("move-before");
            expect(action?.editor).toBe(first.editor);
            expect(action?.sourceEditor).toBe(second.editor);

            tree.setStructure([second, first], second.editor);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(selectedFocusCount).toBe(1);
        } finally {
            HTMLElement.prototype.focus = originalFocus;
        }
    });

    test("restricts insertion and dynamic actions for builder policies", async () => {
        installDom();
        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");
        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [{ label: "Content", accepts: [{ kind: "any-component" as const }] }];
            }
        }
        class DemoBloc extends HTMLElement {}
        const allowed = catalogEntry("basic-card", DemoBloc, TestEditor);
        const self = {
            ...catalogEntry("site-self", DemoBloc, TestEditor),
            insertable: false,
        } as EditorCatalogEntry & { insertable: boolean };
        const container = node("Container", new ContainerEditor(document.createElement("demo-container")));
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setCatalog([allowed, self, catalogEntry("private-card", DemoBloc, TestEditor)]);
        tree.setInsertItems([{ kind: "template", id: "layout", label: "Layout", content: "<main></main>" }]);
        tree.setDataSources([{ label: "Plans", url: "/plans", fields: [] }]);
        tree.setEditingPolicy({
            bindings: false,
            templates: false,
            looseMedia: false,
            canInsertTag: (tag) => tag === "basic-card",
        });
        tree.setStructure([container], container.editor, undefined, { repeatableTargets: [container.target] });

        expect(tree.controller.pickers.rootGroups()[0]?.options.map((option) => option.entry?.tag)).toEqual([
            "basic-card",
        ]);
        expect(tree.controller.pickers.childGroups(container)[0]?.options.map((option) => option.item?.kind)).toEqual([
            "block",
        ]);
        expect(tree.controller.pickers.defaultTemplateItems()).toEqual([]);

        tree.controller.menus.openContextMenu(container, 0, 0);
        const labels = contextLabels(tree);
        expect(labels).not.toContain("Add source");
        expect(labels).not.toContain("Add repeat");
        expect(labels).not.toContain("Add condition");
    });
});

function node(label: string, editor: Editor): EditorStructureNode {
    return {
        editor,
        target: editor.target,
        tag: editor.target.localName,
        label,
        badges: [],
        children: [],
    };
}

function contextLabels(tree: HTMLElement): string[] {
    return Array.from(tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".context-item")).map(
        (button) => button.textContent ?? "",
    );
}

function keyEvent(key: string, shiftKey = false): KeyboardEvent {
    const event = new Event("keydown", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        key: { value: key },
        shiftKey: { value: shiftKey },
    });
    return event as KeyboardEvent;
}

function catalogEntry(
    tag: string,
    bloc: CustomElementConstructor,
    editor: new (target: HTMLElement) => Editor,
): EditorCatalogEntry {
    return { tag, label: tag, bloc, editor };
}
