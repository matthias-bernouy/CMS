import { afterEach, beforeAll, expect, test } from "bun:test";
import { MondialRelayPicker } from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/fulfillment/mondial-relay-picker/runtime/component.ts";

const originalFetch = globalThis.fetch;
beforeAll(() => {
    class TestPicker extends MondialRelayPicker {
        attachInternals() {
            return { setFormValue: () => {} } as unknown as ElementInternals;
        }
    }
    customElements.define("test-relay-copy", TestPicker);
});
afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
});

test("pickup search copy changes keep request validation, result count and selected form value", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
        requests++;
        return Response.json({
            items: [{ location: "FR-123", name: "Local relay", postalCode: "75001", city: "Paris" }],
        });
    }) as typeof fetch;
    const picker = document.createElement("test-relay-copy") as MondialRelayPicker;
    picker.setAttribute("country", "FR");
    picker.setAttribute("auto-search", "false");
    picker.setAttribute("postal-code-label", "ZIP");
    picker.setAttribute("postal-code-required-message", "Enter your ZIP first.");
    picker.setAttribute("results-one-message", "{count} option found.");
    picker.setAttribute("selected-message", "Collection location chosen.");
    document.body.append(picker);
    const root = picker.shadowRoot!;
    const postalCode = root.querySelector<HTMLInputElement>("[name=postalCode]")!;
    expect(root.querySelector("[data-postal-code-label]")!.textContent).toBe("ZIP");
    await picker.search();
    expect(postalCode.validationMessage).toBe("Enter your ZIP first.");
    expect(requests).toBe(0);
    postalCode.value = "75001";
    await picker.search();
    expect(requests).toBe(1);
    expect(root.querySelector("[data-status]")!.textContent).toBe("1 option found.");
    picker.setAttribute("results-one-message", "Found {count} relay.");
    expect(root.querySelector("[data-status]")!.textContent).toBe("Found 1 relay.");
    root.querySelector<HTMLButtonElement>(".option")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(picker.value).toBe("FR-123");
    expect(root.querySelector("[data-status]")!.textContent).toBe("Collection location chosen.");
    picker.removeAttribute("selected-message");
    expect(root.querySelector("[data-status]")!.textContent).toBe("Pickup point selected.");
    expect(picker.value).toBe("FR-123");
    expect(requests).toBe(1);
});
