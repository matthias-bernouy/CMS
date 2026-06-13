import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type {
    Editor,
    EditorCatalog,
} from "@bernouy/cms-content/editor";

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
    });
}

describe("Shell", () => {
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
});
