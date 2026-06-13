import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type {
    Editor,
    EditorCatalog,
} from "@bernouy/cms-content/editor";
import type { TopBarViewportChangeDetail } from "../src/components/Layout/TopBar/TopBar";
import type { EditorStructureNode } from "../src/runtime";

function installDom(): void {
    const { document, customElements, Element, HTMLElement, CustomEvent, Event } = parseHTML(`
        <!DOCTYPE html>
        <html>
            <body></body>
        </html>
    `);

    Object.assign(globalThis, {
        document,
        customElements,
        Element,
        HTMLElement,
        CustomEvent,
        Event,
        requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    });
}

describe("Shell", () => {
    test("topbar emits full and bleed viewport changes", async () => {
        installDom();

        const {
            TOPBAR_VIEWPORT_CHANGE_EVENT,
            TopBar,
        } = await import("../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        const events: TopBarViewportChangeDetail[] = [];
        topbar.addEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<TopBarViewportChangeDetail>).detail);
        });

        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="full"]')!.click();
        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')!.click();

        expect(events).toEqual([
            { viewport: "full" },
            { viewport: "bleed" },
        ]);
    });

    test("receives the editor catalog", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class DemoBloc extends HTMLElement { }
        class DemoEditor {
            constructor(readonly target: HTMLElement) { }
        }

        const catalog: EditorCatalog = [
            {
                tag: "demo-bloc",
                label: "Demo bloc",
                bloc: DemoBloc,
                editor: DemoEditor as unknown as new (target: HTMLElement) => Editor,
            },
        ];
        const shell = new Shell();

        shell.setCatalog(catalog);

        expect(shell.catalog).toEqual(catalog);
        expect(shell.getAttribute("catalog-size")).toBe("1");
    });

    test("ignores native rich text input events without a value detail", async () => {
        installDom();

        const {
            SETTINGS_VIEW_CONTENT_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");
        if (!customElements.get("cms-editor-v2-rich-text-editor")) {
            customElements.define("cms-editor-v2-rich-text-editor", class extends HTMLElement {});
        }

        const view = new SettingsView();
        const events: string[] = [];
        view.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<{ value: string }>).detail.value);
        });

        view.setSettings([], {
            format: "richtext",
            bold:   true,
        }, "Initial");

        const control = view.shadowRoot!.querySelector("cms-editor-v2-rich-text-editor")!;

        control.dispatchEvent(new Event("input", {
            bubbles:  true,
            composed: true,
        }));
        control.dispatchEvent(new CustomEvent("input", {
            bubbles:  true,
            composed: true,
            detail:   { value: "Updated" },
        }));

        expect(events).toEqual(["Updated"]);
    });

    test("renders disabled settings as disabled controls", async () => {
        installDom();

        const {
            SETTINGS_VIEW_SETTING_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");
        if (!customElements.get("cms-editor-v2-text-input")) {
            customElements.define("cms-editor-v2-text-input", class extends HTMLElement {
                constructor() {
                    super();
                    this.attachShadow({ mode: "open" }).innerHTML = "<input>";
                }
            });
        }

        const view = new SettingsView();
        let emitted = false;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, () => {
            emitted = true;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Snippet",
                settings: [
                    {
                        type: "text",
                        label: "Identifier",
                        attribute: "identifier",
                        defaultValue: "main-nav",
                        disabled: true,
                    },
                ],
            },
        ]);

        const control = view.shadowRoot!.querySelector("cms-editor-v2-text-input")!;
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;

        expect(control.hasAttribute("disabled")).toBe(true);
        expect(input.disabled).toBe(true);

        input.value = "changed";
        input.dispatchEvent(new Event("input", {
            bubbles: true,
        }));

        expect(emitted).toBe(false);
    });

    test("renders disabled segmented settings as disabled buttons", async () => {
        installDom();

        const {
            SETTINGS_VIEW_SETTING_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");

        const view = new SettingsView();
        let emitted = false;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, () => {
            emitted = true;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "segmented",
                        label: "Mode",
                        attribute: "mode",
                        defaultValue: "a",
                        disabled: true,
                        options: [
                            { label: "A", value: "a" },
                            { label: "B", value: "b" },
                        ],
                    },
                ],
            },
        ]);

        const buttons = Array.from(view.shadowRoot!.querySelectorAll<HTMLButtonElement>("cms-editor-v2-segmented-control button"));

        expect(buttons.map(button => button.disabled)).toEqual([true, true]);
        buttons[1]?.click();
        expect(emitted).toBe(false);
    });

    test("canvas emits a background click outside the page frame", async () => {
        installDom();

        const {
            CANVAS_BACKGROUND_CLICK_EVENT,
            Canvas,
        } = await import("../src/components/Layout/Canvas/Canvas");

        const canvas = new Canvas();
        const events: Event[] = [];
        canvas.addEventListener(CANVAS_BACKGROUND_CLICK_EVENT, event => events.push(event));
        document.body.append(canvas);
        canvas.connectedCallback();

        canvas.shadowRoot!.querySelector(".canvas")!.dispatchEvent(new Event("click", {
            bubbles:  true,
            composed: true,
        }));
        canvas.shadowRoot!.querySelector(".page")!.dispatchEvent(new Event("click", {
            bubbles:  true,
            composed: true,
        }));

        expect(events).toHaveLength(1);
    });

    test("structure tree only scrolls selected rows when requested", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor {
            constructor(readonly target: HTMLElement) {}
            getContentSlots() {
                return [];
            }
        }

        const target = document.createElement("demo-bloc");
        const editor = new DemoEditor(target) as unknown as Editor;
        const node: EditorStructureNode = {
            editor,
            target,
            tag:      "demo-bloc",
            label:    "Demo",
            badges:   [],
            children: [],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.connectedCallback();

        tree.scrollTop = 120;
        tree.setStructure([node], editor);
        expect(tree.scrollTop).toBe(120);

        let didScroll = false;
        tree.scrollTo = () => {
            didScroll = true;
        };
        tree.setStructure([node], editor, [], { scrollSelectedIntoView: true });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(didScroll).toBe(true);
    });
});
