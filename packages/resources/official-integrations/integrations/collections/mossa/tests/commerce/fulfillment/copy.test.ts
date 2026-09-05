import { afterEach, describe, expect, test } from "bun:test";
import { createBloc } from "./harness";

afterEach(() => {
    document.body.replaceChildren();
});

describe("Fulfillment failure copy", () => {
    test("uses configured missing-sale and error title text without requesting a shipment", async () => {
        const { bloc, calls } = await createBloc(() => {
            throw new Error("No shipment request was expected");
        });
        bloc.removeAttribute("order-id");
        bloc.setAttribute("error-title", "Select a sale first");
        bloc.setAttribute("missing-order-message", "A sale must be selected");
        document.body.append(bloc);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(calls).toHaveLength(0);
        expect(bloc.shadowRoot?.querySelector("[data-error-title]")?.textContent).toBe("Select a sale first");
        expect(bloc.shadowRoot?.querySelector("[data-error-message]")?.textContent).toBe("A sale must be selected");
        bloc.removeAttribute("error-title");
        expect(bloc.shadowRoot?.querySelector("[data-error-title]")?.textContent).toBe("Shipment unavailable");
    });

    test("can override a provider failure and restore the safe default message", async () => {
        const { bloc } = await createBloc(() => {
            throw new Error("Carrier temporarily unavailable");
        });
        document.body.append(bloc);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const message = bloc.shadowRoot?.querySelector("[data-error-message]");
        expect(message?.textContent).toBe("The delivery service is temporarily unavailable. Try again shortly.");
        bloc.setAttribute("error-message", "Please retry shipment details later");
        expect(message?.textContent).toBe("Please retry shipment details later");
        bloc.removeAttribute("error-message");
        expect(message?.textContent).toBe("The delivery service is temporarily unavailable. Try again shortly.");
        expect(message?.textContent).not.toContain("Carrier temporarily unavailable");
    });
});

test("populated shipment labels retain handoff state while copy changes", async () => {
    const { bloc, calls } = await createBloc(() => ({
        orderNumber: "SALE-7",
        shipments: [{ status: "label_ready", sellerHandoffDeclaredAt: "2026-01-01", expeditionNumber: "ZX123" }],
    }));
    bloc.setAttribute("order-label", "Purchase");
    bloc.setAttribute("handoff-declared-label", "Parcel handed over");
    bloc.setAttribute("carrier-scan-pending-message", "Awaiting carrier confirmation.");
    document.body.append(bloc);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = bloc.shadowRoot!;
    expect(root.querySelector("[data-fulfillment-copy=order-label]")!.textContent).toBe("Purchase");
    expect(root.querySelector("[data-status]")!.textContent).toBe("Parcel handed over");
    expect(root.querySelector("[data-latest]")!.textContent).toBe("Awaiting carrier confirmation.");
    expect(root.querySelector<HTMLElement>("[data-handoff]")!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-label]")!.hidden).toBe(false);
    bloc.removeAttribute("handoff-declared-label");
    expect(root.querySelector("[data-status]")!.textContent).toBe("Handoff declared");
    expect(calls).toHaveLength(1);
});
