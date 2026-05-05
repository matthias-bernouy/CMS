import { describe, test, expect, beforeEach } from "bun:test";
import { SyncPanel } from "src/control/components/editor/componentSync/SyncPanel";

describe("ConfigPanel", () => {
    let panel: SyncPanel;

    beforeEach(() => {
        document.body.innerHTML = "";
        panel = document.createElement("p9r-config-panel") as SyncPanel;
        document.body.appendChild(panel);
    });

    test("registers itself as the `p9r-config-panel` custom element", () => {
        expect(customElements.get("p9r-config-panel")).toBe(SyncPanel as unknown as CustomElementConstructor);
    });

    test("init() propagates to every light-DOM child that exposes an init() method", () => {
        const callLog: string[] = [];

        const child1 = document.createElement("div");
        (child1 as any).init = () => callLog.push("child1");
        const child2 = document.createElement("span");
        (child2 as any).init = () => callLog.push("child2");
        const childNoInit = document.createElement("p");

        panel.appendChild(child1);
        panel.appendChild(child2);
        panel.appendChild(childNoInit);

        panel.init();
        expect(callLog).toEqual(["child1", "child2"]);
    });

    test("init() is a no-op when the panel has no children", () => {
        expect(() => panel.init()).not.toThrow();
    });

    test("init() walks descendants recursively (querySelectorAll('*'))", () => {
        const callLog: string[] = [];
        const wrapper = document.createElement("div");
        const nested = document.createElement("div");
        (nested as any).init = () => callLog.push("nested");
        wrapper.appendChild(nested);
        panel.appendChild(wrapper);

        panel.init();
        expect(callLog).toEqual(["nested"]);
    });

    test("show() / close() delegate to the underlying LateralDialog in shadow DOM", () => {
        const dialog = panel.shadowRoot?.querySelector("w13c-lateral-dialog") as any;
        expect(dialog).toBeTruthy();

        let showCalls = 0;
        let closeCalls = 0;
        dialog.show = () => { showCalls++; };
        dialog.close = () => { closeCalls++; };

        // Re-run connectedCallback so our stubs are picked up via the
        // cached private reference.
        panel.connectedCallback();

        panel.show();
        panel.close();
        expect(showCalls).toBe(1);
        expect(closeCalls).toBe(1);
    });
});
