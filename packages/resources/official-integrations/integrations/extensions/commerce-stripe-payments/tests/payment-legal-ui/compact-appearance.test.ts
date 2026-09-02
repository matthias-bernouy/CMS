import { expect, test } from "bun:test";
import { mountPaymentElement } from "./harness";

const versionId = "018f72b8-1f90-7c31-a933-592c90c8178a";

test("offers an accessible compact legal appearance without visible heading or version copy", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
        const id = new URL(input instanceof Request ? input.url : String(input)).pathname.split("/").at(-1);
        if (id === "getPaymentLegalRequirements") {
            return Response.json({
                enabled: true,
                documents: [
                    {
                        key: "terms",
                        label: "Conditions générales de vente",
                        consentText: "J’accepte les conditions générales de vente.",
                        pageUrl: "/cgu-cgv",
                        versionId,
                        versionDate: "2026-07-24T12:00:00.000Z",
                    },
                ],
            });
        }
        throw new Error(`unexpected payment call before legal acceptance: ${id}`);
    };

    try {
        const payment = await mountPaymentElement({ "legal-appearance": "compact" });
        try {
            const checkbox = payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]")!;
            const label = payment.root.querySelector<HTMLLabelElement>(".legal-document-consent")!;
            const link = payment.querySelector<HTMLAnchorElement>(":scope > a[data-commerce-payment-legal-link]")!;
            const linkSlot = label.querySelector<HTMLSlotElement>("slot")!;
            const styles = payment.root.querySelector("style")?.textContent ?? "";
            expect(checkbox.required).toBe(true);
            expect(checkbox.checked).toBe(false);
            expect(label.htmlFor).toBe(checkbox.id);
            expect(label.textContent).toBe("J’accepte les .");
            expect(link.textContent).toBe("Conditions générales de vente");
            expect(link.pathname).toBe("/cgu-cgv");
            expect(linkSlot.assignedElements()).toEqual([link]);
            expect(payment.root.querySelector(".legal-document-version")).toBeNull();
            expect(styles).toContain(':host([legal-appearance="compact"]) .legal legend');

            checkbox.checked = true;
            payment.setAttribute("legal-appearance", "detailed");
            expect(payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]")?.checked).toBeTrue();
            expect(payment.root.querySelector(".legal-document-version")).not.toBeNull();
        } finally {
            payment.remove();
        }
    } finally {
        globalThis.fetch = realFetch;
    }
});
