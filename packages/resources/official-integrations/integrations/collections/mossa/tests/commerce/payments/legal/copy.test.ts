import { expect, test } from "bun:test";
import { mountPaymentElement, settlePaymentLifecycle, submitPayment } from "./harness";

const versionId = "018f72b8-1f90-7c31-a933-592c90c8178a";

test("updates payment and legal copy while preserving explicit consent and safe errors", async () => {
    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
        const path = String(input);
        calls.push(path);
        if (path.includes("getPaymentLegalRequirements")) {
            return Response.json({
                enabled: true,
                documents: [
                    {
                        key: "terms",
                        label: "Terms",
                        consentText: "I agree to these terms.",
                        pageUrl: "/terms",
                        versionId,
                        versionDate: "2026-07-24T12:00:00.000Z",
                    },
                ],
            });
        }
        throw new Error("Payment must wait for explicit consent");
    }) as typeof fetch;
    const payment = await mountPaymentElement({
        "legal-title": "Purchase terms",
        "legal-read-label": "Open {document}",
        "legal-version-label": "Published {date}",
        "security-label": "Your payment details are encrypted.",
        "continue-label": "Accept and continue",
        "legal-required-message": "Accept each document first.",
    });
    try {
        expect(payment.root.querySelector("legend")?.textContent).toBe("Purchase terms");
        expect(payment.root.querySelector(".security > span")?.textContent).toBe("Your payment details are encrypted.");
        expect(payment.querySelector("[data-commerce-payment-legal-link]")?.textContent).toBe("Open Terms");
        expect(payment.root.querySelector("[data-submit]")?.textContent).toBe("Accept and continue");
        expect(payment.root.querySelector(".legal-document-version")?.textContent).toStartWith("Published ");
        submitPayment(payment);
        await settlePaymentLifecycle();
        expect(payment.root.querySelector("[data-status]")?.textContent).toBe("Accept each document first.");
        const checkbox = payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]")!;
        checkbox.checked = true;
        payment.setAttribute("legal-read-label", "Review {document}");
        expect(payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]")?.checked).toBe(true);
        expect(payment.querySelector("[data-commerce-payment-legal-link]")?.textContent).toBe("Review Terms");
        expect(calls).toHaveLength(1);
    } finally {
        payment.remove();
        globalThis.fetch = realFetch;
    }
});
