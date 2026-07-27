import type { ContentSlot } from "@bernouy/cms-content/editor";
import {
    Editor,
    describe,
    expect,
    installDom,
    parseHTML,
    setShellFrameDocument,
    shellParts,
    shellState,
    test,
} from "../../support/shellTestSupport";

describe("Shell cross-slot mutations", () => {
    test("allows compatible moves and pastes while rejecting incompatible target slots", async () => {
        const fixture = await slotFixture([
            componentSlot("Text", "text", "demo-text", { max: 3 }),
            componentSlot("Feature", "feature", "demo-text", { max: 3 }),
            componentSlot("Media", "media", "demo-image", { max: 3 }),
        ]);

        fixture.move("text-a", "image-target", "move-before");
        expect(fixture.element("text-a").getAttribute("slot")).toBe("text");

        fixture.move("text-a", "feature-target", "move-before");
        expect(fixture.element("text-a").getAttribute("slot")).toBe("feature");
        expect(fixture.slotCount("feature")).toBe(2);

        fixture.copy("text-b");
        fixture.pasteAfter("image-target");
        expect(fixture.contentRoot.querySelectorAll("#text-b")).toHaveLength(1);
        expect(fixture.slotCount("media")).toBe(1);

        fixture.pasteAfter("feature-target");
        expect(fixture.contentRoot.querySelectorAll("#text-b")).toHaveLength(2);
        expect(fixture.slotCount("feature")).toBe(3);
    });

    test("preserves source minimum and target maximum across move, duplicate and paste", async () => {
        const fixture = await slotFixture([
            componentSlot("Text", "text", "demo-text", { min: 1, max: 2 }),
            componentSlot("Feature", "feature", "demo-text", { max: 3 }),
            componentSlot("Media", "media", "demo-image", { max: 1 }),
        ]);

        fixture.move("text-a", "feature-target", "move-before");
        expect(fixture.slotCount("text")).toBe(1);
        expect(fixture.slotCount("feature")).toBe(2);

        fixture.move("text-b", "feature-target", "move-before");
        expect(fixture.element("text-b").getAttribute("slot")).toBe("text");
        expect(fixture.slotCount("text")).toBe(1);

        fixture.duplicate("feature-target");
        expect(fixture.slotCount("feature")).toBe(3);
        fixture.duplicate("feature-target");
        expect(fixture.slotCount("feature")).toBe(3);

        fixture.copy("text-b");
        fixture.pasteAfter("feature-target");
        expect(fixture.contentRoot.querySelectorAll("#text-b")).toHaveLength(1);
        expect(fixture.slotCount("feature")).toBe(3);
    });

    test("allows reordering inside a slot at its minimum", async () => {
        const fixture = await slotFixture([
            componentSlot("Text", "text", "demo-text", { min: 2, max: 2 }),
            componentSlot("Feature", "feature", "demo-text", { max: 3 }),
            componentSlot("Media", "media", "demo-image", { max: 1 }),
        ]);

        fixture.move("text-b", "text-a", "move-before");

        expect(fixture.slotCount("text")).toBe(2);
        expect(fixture.slotIds("text")).toEqual(["text-b", "text-a"]);
    });

    test("rejects duplicating legacy content that is incompatible with its current slot", async () => {
        const fixture = await slotFixture([
            componentSlot("Text", "text", "demo-text", { max: 3 }),
            componentSlot("Feature", "feature", "demo-text", { max: 3 }),
            componentSlot("Media", "media", "demo-image", { max: 3 }),
        ]);
        fixture.element("image-target").setAttribute("slot", "feature");

        fixture.duplicate("image-target");

        expect(fixture.slotCount("feature")).toBe(2);
        expect(fixture.contentRoot.querySelectorAll("#image-target")).toHaveLength(1);
    });
});

type SlotFixture = {
    contentRoot: HTMLElement;
    element(id: string): HTMLElement;
    slotCount(name: string): number;
    slotIds(name: string): string[];
    move(sourceId: string, targetId: string, action: "move-before" | "move-after"): void;
    copy(id: string): void;
    pasteAfter(id: string): void;
    duplicate(id: string): void;
};

async function slotFixture(slots: ContentSlot[]): Promise<SlotFixture> {
    installDom();
    const { Shell } = await import("../../../../src/exports");
    class HostEditor extends Editor {
        protected override contentSlots(): ContentSlot[] {
            return slots;
        }
    }
    class TextEditor extends Editor {}
    class ImageEditor extends Editor {}
    const { document: frameDocument } = parseHTML(`
        <div data-cms-editor-root>
            <demo-host data-cms-content>
                <demo-text id="text-a" slot="text"></demo-text>
                <demo-text id="text-b" slot="text"></demo-text>
                <demo-text id="feature-target" slot="feature"></demo-text>
                <demo-image id="image-target" slot="media"></demo-image>
            </demo-host>
        </div>
    `);
    const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
    const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
    const shell = new Shell();
    document.body.append(shell);
    shell.setCatalog([
        catalogEntry("demo-host", HostEditor),
        catalogEntry("demo-text", TextEditor),
        catalogEntry("demo-image", ImageEditor),
    ]);
    setShellFrameDocument(shell, frameDocument);
    shell.loadDocument({ root, contentRoot });

    const editor = (id: string): Editor => {
        const value = shellState(shell).runtime?.getEditor(element(id));
        if (!value) {
            throw new Error(`Missing editor for ${id}`);
        }
        return value;
    };
    const element = (id: string): HTMLElement => contentRoot.querySelector<HTMLElement>(`#${id}`)!;
    const action = (kind: "copy" | "paste-after" | "duplicate", id: string): void => {
        shellParts(shell).mutations.handleStructureAction({ action: kind, editor: editor(id) });
    };

    return {
        contentRoot,
        element,
        slotCount: (name) => contentRoot.querySelectorAll(`[slot="${name}"]`).length,
        slotIds: (name) =>
            Array.from(contentRoot.querySelectorAll<HTMLElement>(`[slot="${name}"]`)).map((element) => element.id),
        move: (sourceId, targetId, kind) => {
            shellParts(shell).mutations.handleStructureAction({
                action: kind,
                sourceEditor: editor(sourceId),
                editor: editor(targetId),
            });
        },
        copy: (id) => action("copy", id),
        pasteAfter: (id) => action("paste-after", id),
        duplicate: (id) => action("duplicate", id),
    };
}

function componentSlot(
    label: string,
    slot: string,
    tag: string,
    cardinality: Pick<ContentSlot, "min" | "max">,
): ContentSlot {
    return { label, slot, accepts: [{ kind: "component", tag }], ...cardinality };
}

function catalogEntry(tag: string, editor: typeof Editor) {
    return {
        tag,
        label: tag,
        bloc: HTMLElement as unknown as CustomElementConstructor,
        editor,
    };
}
