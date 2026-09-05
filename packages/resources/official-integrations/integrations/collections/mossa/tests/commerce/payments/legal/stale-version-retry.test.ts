import { expect, test } from "bun:test";
import { mountPaymentElement, settlePaymentLifecycle, submitPayment, succeededPayment } from "./harness";

const versionOne = "018f72b8-1f90-7c31-a933-592c90c8178a";
const versionTwo = "018f72b8-1f90-7c31-a933-592c90c8178b";

test("requires consent to the refreshed legal version before retrying payment", async () => {
    const requests: Array<{ id: string; body: unknown }> = [];
    let requirementsRead = 0;
    let paymentCreationAttempts = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const id = functionId(input);
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        requests.push({ id, body });
        if (id === "getPaymentLegalRequirements") {
            requirementsRead += 1;
            return Response.json(requirements(requirementsRead === 1 ? versionOne : versionTwo));
        }
        if (id === "createPaymentForOrder") {
            paymentCreationAttempts += 1;
            return paymentCreationAttempts === 1
                ? Response.json({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" }, { status: 409 })
                : Response.json(succeededPayment());
        }
        throw new Error(`unexpected payment call: ${id}`);
    };

    try {
        const payment = await mountPaymentElement();
        try {
            const initial = payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]");
            expect(initial?.dataset.legalVersionId).toBe(versionOne);
            expect(initial?.checked).toBeFalse();
            expect(payment.root.querySelector(".legal-document")?.textContent).toContain("terms of sale");
            if (!initial) {
                throw new Error("initial legal checkbox not rendered");
            }

            initial.checked = true;
            submitPayment(payment);
            await settlePaymentLifecycle();

            const refreshed = payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]");
            expect(requests.map(({ id }) => id)).toEqual([
                "getPaymentLegalRequirements",
                "createPaymentForOrder",
                "getPaymentLegalRequirements",
            ]);
            expect(refreshed?.dataset.legalVersionId).toBe(versionTwo);
            expect(refreshed?.checked).toBeFalse();
            if (!refreshed) {
                throw new Error("refreshed legal checkbox not rendered");
            }

            refreshed.checked = true;
            submitPayment(payment);
            await settlePaymentLifecycle();

            expect(requests.map(({ id }) => id)).toEqual([
                "getPaymentLegalRequirements",
                "createPaymentForOrder",
                "getPaymentLegalRequirements",
                "createPaymentForOrder",
            ]);
            expect(requests.filter(({ id }) => id === "createPaymentForOrder").map(({ body }) => body)).toEqual([
                { orderId: 42, acceptedLegalDocumentVersionIds: [versionOne] },
                { orderId: 42, acceptedLegalDocumentVersionIds: [versionTwo] },
            ]);
            expect(payment.root.querySelector("[data-status]")?.textContent).toContain("Payment confirmed");
        } finally {
            payment.remove();
        }
    } finally {
        globalThis.fetch = realFetch;
    }
});

function requirements(versionId: string): Record<string, unknown> {
    return {
        enabled: true,
        documents: [
            {
                key: "terms",
                label: "Terms of sale",
                consentText: "I accept the terms of sale.",
                pageUrl: "/terms",
                versionId,
                versionDate: "2026-07-24T12:00:00.000Z",
            },
        ],
    };
}

function functionId(input: RequestInfo | URL): string {
    return new URL(input instanceof Request ? input.url : String(input)).pathname.split("/").at(-1) ?? "";
}
