import { describe, expect, test } from "bun:test";
import { mountPaymentElement, settlePaymentLifecycle, submitPayment, succeededPayment } from "./harness";

const versionOne = "018f72b8-1f90-7c31-a933-592c90c8178a";
const versionTwo = "018f72b8-1f90-7c31-a933-592c90c8178b";

describe("commerce Stripe payment buyer legal UI", () => {
    test("blocks payment until every rendered legal document is accepted", async () => {
        const requests: Array<{ id: string; body: unknown }> = [];
        await withFetch(
            async (input, init) => {
                const id = functionId(input);
                const body = init?.body ? JSON.parse(String(init.body)) : null;
                requests.push({ id, body });
                if (id === "getPaymentLegalRequirements") {
                    return Response.json(requirements(versionOne, true));
                }
                if (id === "createPaymentForOrder") {
                    return Response.json(succeededPayment());
                }
                throw new Error(`unexpected payment call before legal acceptance: ${id}`);
            },
            async () => {
                const payment = await mountPaymentElement();
                try {
                    const checkboxes = payment.root.querySelectorAll<HTMLInputElement>("[data-legal-version-id]");
                    const link = payment.querySelector<HTMLAnchorElement>(
                        ":scope > a[data-commerce-payment-legal-link]",
                    );
                    expect(checkboxes).toHaveLength(2);
                    expect(Array.from(checkboxes, ({ checked }) => checked)).toEqual([false, false]);
                    expect(Array.from(checkboxes, ({ required }) => required)).toEqual([true, true]);
                    expect(link?.target).toBe("_blank");
                    expect(link?.rel).toBe("noopener noreferrer");
                    expect(link?.pathname).toBe("/cgu-cgv");
                    expect(requests.map(({ id }) => id)).toEqual(["getPaymentLegalRequirements"]);

                    submitPayment(payment);
                    await settlePaymentLifecycle();
                    expect(requests.map(({ id }) => id)).toEqual(["getPaymentLegalRequirements"]);
                    expect(payment.root.querySelector("[data-status]")?.textContent).toContain(
                        "accepter toutes les conditions",
                    );

                    const firstCheckbox = checkboxes[0];
                    const secondCheckbox = checkboxes[1];
                    if (!firstCheckbox || !secondCheckbox) {
                        throw new Error("legal checkboxes not rendered");
                    }
                    firstCheckbox.checked = true;
                    submitPayment(payment);
                    await settlePaymentLifecycle();
                    expect(requests.map(({ id }) => id)).toEqual(["getPaymentLegalRequirements"]);

                    secondCheckbox.checked = true;
                    secondCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
                    submitPayment(payment);
                    await settlePaymentLifecycle();
                    expect(requests.map(({ id }) => id)).toEqual([
                        "getPaymentLegalRequirements",
                        "createPaymentForOrder",
                    ]);
                    expect(requests[1]?.body).toEqual({
                        orderId: 42,
                        acceptedLegalDocumentVersionIds: [versionOne, versionTwo],
                    });
                } finally {
                    payment.remove();
                }
            },
        );
    });

    test("reloads changed requirements unchecked without calling Stripe", async () => {
        let requirementsRead = 0;
        const requests: string[] = [];
        await withFetch(
            async (input, init) => {
                const id = functionId(input);
                requests.push(id);
                if (id === "getPaymentLegalRequirements") {
                    requirementsRead += 1;
                    return Response.json(requirements(requirementsRead === 1 ? versionOne : versionTwo));
                }
                if (id === "createPaymentForOrder") {
                    expect(JSON.parse(String(init?.body))).toEqual({
                        orderId: 42,
                        acceptedLegalDocumentVersionIds: [versionOne],
                    });
                    return Response.json({ error: "LEGAL_DOCUMENT_VERSION_CHANGED" }, { status: 409 });
                }
                throw new Error(`unexpected Stripe call: ${id}`);
            },
            async () => {
                const payment = await mountPaymentElement();
                try {
                    const initial = payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]");
                    if (!initial) {
                        throw new Error("legal checkbox not rendered");
                    }
                    initial.checked = true;
                    submitPayment(payment);
                    await settlePaymentLifecycle();
                    const refreshed = payment.root.querySelector<HTMLInputElement>("[data-legal-version-id]");
                    expect(requests).toEqual([
                        "getPaymentLegalRequirements",
                        "createPaymentForOrder",
                        "getPaymentLegalRequirements",
                    ]);
                    expect(refreshed?.dataset.legalVersionId).toBe(versionTwo);
                    expect(refreshed?.checked).toBeFalse();
                    expect(payment.root.querySelector("[data-status]")?.textContent).toContain("ont changé");
                } finally {
                    payment.remove();
                }
            },
        );
    });

    test("keeps automatic initialization when legal acceptance is disabled", async () => {
        const requests: string[] = [];
        await withFetch(
            async (input) => {
                const id = functionId(input);
                requests.push(id);
                return Response.json(
                    id === "getPaymentLegalRequirements" ? { enabled: false, documents: [] } : succeededPayment(),
                );
            },
            async () => {
                const payment = await mountPaymentElement();
                try {
                    expect(requests).toEqual(["getPaymentLegalRequirements", "createPaymentForOrder"]);
                    expect(payment.root.querySelector<HTMLElement>("[data-legal-region]")?.hidden).toBeTrue();
                    expect(payment.root.querySelector("[data-status]")?.textContent).toContain("Paiement confirmé");
                } finally {
                    payment.remove();
                }
            },
        );
    });
});

function requirements(versionId: string, includeSecondDocument = false): Record<string, unknown> {
    const documents = [
        {
            key: "terms",
            label: "Conditions générales de vente",
            consentText: "J’accepte les conditions générales de vente.",
            pageUrl: "/cgu-cgv",
            versionId,
            versionDate: "2026-07-24T12:00:00.000Z",
        },
    ];
    if (includeSecondDocument) {
        documents.push({
            key: "privacy",
            label: "Politique de confidentialité",
            consentText: "J’ai lu la politique de confidentialité.",
            pageUrl: "/confidentialite",
            versionId: versionTwo,
            versionDate: "2026-07-24T12:00:00.000Z",
        });
    }
    return {
        enabled: true,
        documents,
    };
}

async function withFetch(fetchImpl: typeof fetch, run: () => Promise<void>): Promise<void> {
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
        await run();
    } finally {
        globalThis.fetch = realFetch;
    }
}

function functionId(input: RequestInfo | URL): string {
    return new URL(input instanceof Request ? input.url : String(input)).pathname.split("/").at(-1) ?? "";
}
