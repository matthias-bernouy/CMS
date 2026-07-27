import { describe, expect, test } from "bun:test";
import {
    mountStripeConnectOnboarding,
    settleOnboardingLifecycle,
    submitInitialOnboarding,
    submitMarketplaceTerms,
} from "./harness";

const versionOne = "seller-terms-2026-07-27";
const versionTwo = "seller-terms-2026-07-28";
const hashOne = "a".repeat(64);
const hashTwo = "b".repeat(64);

describe("Stripe Connect onboarding marketplace terms UI", () => {
    test("shows a dedicated terms panel for an active seller without reopening IBAN onboarding", async () => {
        const requests: string[] = [];
        await withFetch(
            async (input) => {
                const id = functionId(input);
                requests.push(id);
                if (id === "getConnectStatus") {
                    return Response.json(activeStatus(false, publishedRequirement(versionOne, hashOne)));
                }
                throw new Error(`unexpected seller call: ${id}`);
            },
            async () => {
                const onboarding = await mountStripeConnectOnboarding();
                try {
                    const termsForm = onboarding.root.querySelector<HTMLFormElement>("[data-terms-form]");
                    const checkbox = termsForm?.querySelector<HTMLInputElement>("[name='marketplaceTermsAccepted']");
                    const link = termsForm?.querySelector<HTMLAnchorElement>("[data-marketplace-terms]");

                    expect(requests).toEqual(["getConnectStatus"]);
                    expect(termsForm?.hidden).toBeFalse();
                    expect(checkbox?.checked).toBeFalse();
                    expect(checkbox?.required).toBeTrue();
                    expect(link?.pathname).toBe("/conditions-vendeur");
                    expect(link?.target).toBe("_blank");
                    expect(onboarding.root.querySelector<HTMLFormElement>("[data-form]")?.hidden).toBeTrue();
                    expect(onboarding.root.querySelector<HTMLElement>("[data-wallet]")?.hidden).toBeTrue();
                } finally {
                    onboarding.remove();
                }
            },
        );
    });

    test("keeps explicit legacy terms usable through the configured presentation fallback", async () => {
        const requests: Array<{ id: string; body: unknown }> = [];
        const legacyRequirement = { mode: "legacy", version: "seller-terms-legacy-v3", hash: hashOne };
        await withFetch(
            async (input, init) => {
                const id = functionId(input);
                const body = init?.body ? JSON.parse(String(init.body)) : null;
                requests.push({ id, body });
                if (id === "getConnectStatus") {
                    return Response.json(activeStatus(false, legacyRequirement));
                }
                if (id === "enrollConnectSeller") {
                    return Response.json(activeStatus(true, legacyRequirement));
                }
                if (id === "getConnectWallet") {
                    return Response.json({ balances: [] });
                }
                throw new Error(`unexpected seller call: ${id}`);
            },
            async () => {
                const onboarding = await mountStripeConnectOnboarding({
                    "terms-url": "/conditions-vendeur-historiques",
                    "marketplace-terms-label": "Conditions vendeur historiques",
                    "marketplace-consent-text": "J’accepte les Conditions vendeur historiques.",
                });
                try {
                    const termsForm = onboarding.root.querySelector<HTMLFormElement>("[data-terms-form]");
                    const checkbox = termsForm?.querySelector<HTMLInputElement>("[name='marketplaceTermsAccepted']");
                    const link = termsForm?.querySelector<HTMLAnchorElement>("[data-marketplace-terms]");
                    expect(termsForm?.hidden).toBeFalse();
                    expect(termsForm?.textContent).toContain("J’accepte les Conditions vendeur historiques.");
                    expect(link?.pathname).toBe("/conditions-vendeur-historiques");
                    expect(link?.textContent).toBe("Conditions vendeur historiques");
                    if (!checkbox) {
                        throw new Error("legacy marketplace terms checkbox not rendered");
                    }
                    checkbox.checked = true;
                    submitMarketplaceTerms(onboarding);
                    await settleOnboardingLifecycle();

                    expect(requests).toEqual([
                        { id: "getConnectStatus", body: null },
                        {
                            id: "enrollConnectSeller",
                            body: {
                                marketplaceTermsAccepted: true,
                                expectedMarketplaceTermsVersion: legacyRequirement.version,
                                expectedMarketplaceTermsHash: legacyRequirement.hash,
                            },
                        },
                        { id: "getConnectWallet", body: null },
                    ]);
                    expect(onboarding.root.querySelector<HTMLElement>("[data-wallet]")?.hidden).toBeFalse();
                } finally {
                    onboarding.remove();
                }
            },
        );
    });

    test("requires both initial consents before tokenization and submits their exact evidence", async () => {
        const requests: Array<{ id: string; body: unknown }> = [];
        const accountTokenCalls: Array<{ publishableKey: string; payload: unknown }> = [];
        const bankTokenCalls: Array<{ publishableKey: string; payload: unknown }> = [];
        let statusReads = 0;
        await withFetch(
            async (input, init) => {
                const id = functionId(input);
                const body = init?.body ? JSON.parse(String(init.body)) : null;
                requests.push({ id, body });
                if (id === "getConnectStatus") {
                    statusReads += 1;
                    return Response.json(
                        statusReads === 1
                            ? inactiveStatus(publishedRequirement(versionOne, hashOne))
                            : {
                                  onboardingStatus: "pending_verification",
                                  payoutsEnabled: false,
                                  marketplaceTermsCurrentVersionAccepted: true,
                                  marketplaceTermsRequirement: publishedRequirement(versionOne, hashOne),
                              },
                    );
                }
                if (id === "getAccount") {
                    return Response.json(completeProfile());
                }
                if (id === "me") {
                    return Response.json({ subject: { email: "vendeuse@example.test" } });
                }
                if (id === "submitConnectVerification") {
                    return Response.json({
                        onboardingStatus: "pending_verification",
                        payoutsEnabled: false,
                        marketplaceTermsCurrentVersionAccepted: true,
                    });
                }
                throw new Error(`unexpected seller call: ${id}`);
            },
            async () => {
                const onboarding = await mountStripeConnectOnboarding();
                try {
                    onboarding.clientConfig = async () => ({ publishableKey: "pk_test_courtside" });
                    onboarding.createAccountToken = async (publishableKey, payload) => {
                        accountTokenCalls.push({ publishableKey, payload });
                        return "account_token_test";
                    };
                    onboarding.createBankAccountToken = async (publishableKey, payload) => {
                        bankTokenCalls.push({ publishableKey, payload });
                        return "bank_token_test";
                    };

                    await onboarding.prepareActivation();
                    const form = onboarding.root.querySelector<HTMLFormElement>("[data-form]");
                    const marketplaceConsent = form?.querySelector<HTMLInputElement>(
                        "[name='marketplaceTermsAccepted']",
                    );
                    const paymentConsent = form?.querySelector<HTMLInputElement>("[name='paymentTermsAccepted']");
                    const iban = form?.querySelector<HTMLInputElement>("[name='iban']");
                    if (!marketplaceConsent || !paymentConsent || !iban) {
                        throw new Error("initial onboarding controls not rendered");
                    }
                    expect(form?.hidden).toBeFalse();
                    expect(marketplaceConsent).not.toBe(paymentConsent);
                    expect(marketplaceConsent.checked).toBeFalse();
                    expect(paymentConsent.checked).toBeFalse();
                    expect(marketplaceConsent.required).toBeTrue();
                    expect(paymentConsent.required).toBeTrue();

                    iban.value = "FR76 3000 6000 0112 3456 7890 189";
                    marketplaceConsent.checked = true;
                    submitInitialOnboarding(onboarding);
                    await settleOnboardingLifecycle();

                    expect(accountTokenCalls).toEqual([]);
                    expect(bankTokenCalls).toEqual([]);
                    expect(requests.some(({ id }) => id === "submitConnectVerification")).toBeFalse();

                    paymentConsent.checked = true;
                    submitInitialOnboarding(onboarding);
                    await settleOnboardingLifecycle();

                    expect(accountTokenCalls).toHaveLength(1);
                    expect(bankTokenCalls).toHaveLength(1);
                    expect(accountTokenCalls[0]?.publishableKey).toBe("pk_test_courtside");
                    expect(accountTermsAttestation(accountTokenCalls[0]?.payload)).toBeTrue();
                    expect(bankTokenCalls[0]).toEqual({
                        publishableKey: "pk_test_courtside",
                        payload: {
                            account_holder_name: "Alice Martin",
                            account_holder_type: "individual",
                            country: "FR",
                            currency: "eur",
                            account_number: "FR7630006000011234567890189",
                        },
                    });
                    expect(requests.filter(({ id }) => id === "submitConnectVerification")).toEqual([
                        {
                            id: "submitConnectVerification",
                            body: {
                                accountToken: "account_token_test",
                                bankAccountToken: "bank_token_test",
                                contactEmail: "vendeuse@example.test",
                                marketplaceTermsAccepted: true,
                                expectedMarketplaceTermsVersion: versionOne,
                                expectedMarketplaceTermsHash: hashOne,
                            },
                        },
                    ]);
                } finally {
                    onboarding.remove();
                }
            },
        );
    });

    test("records the exact published version and then opens the wallet", async () => {
        const requests: Array<{ id: string; body: unknown }> = [];
        await withFetch(
            async (input, init) => {
                const id = functionId(input);
                const body = init?.body ? JSON.parse(String(init.body)) : null;
                requests.push({ id, body });
                if (id === "getConnectStatus") {
                    return Response.json(activeStatus(false, publishedRequirement(versionOne, hashOne)));
                }
                if (id === "enrollConnectSeller") {
                    return Response.json(activeStatus(true, publishedRequirement(versionOne, hashOne)));
                }
                if (id === "getConnectWallet") {
                    return Response.json({ balances: [{ currency: "eur", available: 12_345, pending: 670 }] });
                }
                throw new Error(`unexpected seller call: ${id}`);
            },
            async () => {
                const onboarding = await mountStripeConnectOnboarding();
                try {
                    expect(typeof onboarding.submitMarketplaceTermsAcceptance).toBe("function");
                    const checkbox = onboarding.root.querySelector<HTMLInputElement>(
                        "[data-terms-form] [name='marketplaceTermsAccepted']",
                    );
                    if (!checkbox) {
                        throw new Error("marketplace terms checkbox not rendered");
                    }
                    checkbox.checked = true;
                    submitMarketplaceTerms(onboarding);
                    await settleOnboardingLifecycle();

                    expect(requests).toEqual([
                        { id: "getConnectStatus", body: null },
                        {
                            id: "enrollConnectSeller",
                            body: {
                                marketplaceTermsAccepted: true,
                                expectedMarketplaceTermsVersion: versionOne,
                                expectedMarketplaceTermsHash: hashOne,
                            },
                        },
                        { id: "getConnectWallet", body: null },
                    ]);
                    expect(onboarding.root.querySelector<HTMLElement>("[data-terms-form]")?.hidden).toBeTrue();
                    expect(onboarding.root.querySelector<HTMLElement>("[data-wallet]")?.hidden).toBeFalse();
                    expect(onboarding.root.querySelector("[data-balances]")?.textContent).toContain("123,45");
                } finally {
                    onboarding.remove();
                }
            },
        );
    });

    test("reloads a changed published version unchecked before another acceptance", async () => {
        const requests: Array<{ id: string; body: unknown }> = [];
        let statusReads = 0;
        await withFetch(
            async (input, init) => {
                const id = functionId(input);
                const body = init?.body ? JSON.parse(String(init.body)) : null;
                requests.push({ id, body });
                if (id === "getConnectStatus") {
                    statusReads += 1;
                    return Response.json(
                        activeStatus(
                            false,
                            statusReads === 1
                                ? publishedRequirement(versionOne, hashOne)
                                : publishedRequirement(versionTwo, hashTwo, {
                                      label: "Nouvelles conditions vendeur",
                                      path: "/nouvelles-conditions-vendeur",
                                  }),
                        ),
                    );
                }
                if (id === "enrollConnectSeller") {
                    return Response.json({ error: "MARKETPLACE_TERMS_VERSION_CHANGED" }, { status: 409 });
                }
                throw new Error(`unexpected seller call: ${id}`);
            },
            async () => {
                const onboarding = await mountStripeConnectOnboarding();
                try {
                    const initial = onboarding.root.querySelector<HTMLInputElement>(
                        "[data-terms-form] [name='marketplaceTermsAccepted']",
                    );
                    if (!initial) {
                        throw new Error("marketplace terms checkbox not rendered");
                    }
                    initial.checked = true;
                    submitMarketplaceTerms(onboarding);
                    await settleOnboardingLifecycle();

                    const refreshed = onboarding.root.querySelector<HTMLInputElement>(
                        "[data-terms-form] [name='marketplaceTermsAccepted']",
                    );
                    const refreshedLink = onboarding.root.querySelector<HTMLAnchorElement>(
                        "[data-terms-form] [data-marketplace-terms]",
                    );
                    expect(requests).toEqual([
                        { id: "getConnectStatus", body: null },
                        {
                            id: "enrollConnectSeller",
                            body: {
                                marketplaceTermsAccepted: true,
                                expectedMarketplaceTermsVersion: versionOne,
                                expectedMarketplaceTermsHash: hashOne,
                            },
                        },
                        { id: "getConnectStatus", body: null },
                    ]);
                    expect(refreshed?.checked).toBeFalse();
                    expect(refreshedLink?.pathname).toBe("/nouvelles-conditions-vendeur");
                    expect(refreshedLink?.textContent).toBe("Nouvelles conditions vendeur");
                    expect(onboarding.root.querySelector<HTMLElement>("[data-terms-form]")?.hidden).toBeFalse();
                    expect(onboarding.root.querySelector("[data-status]")?.textContent).toContain("ont changé");
                } finally {
                    onboarding.remove();
                }
            },
        );
    });

    test("opens the wallet directly when the current marketplace terms are already accepted", async () => {
        const requests: string[] = [];
        await withFetch(
            async (input) => {
                const id = functionId(input);
                requests.push(id);
                if (id === "getConnectStatus") {
                    return Response.json(activeStatus(true, publishedRequirement(versionOne, hashOne)));
                }
                if (id === "getConnectWallet") {
                    return Response.json({ balances: [] });
                }
                throw new Error(`unexpected seller call: ${id}`);
            },
            async () => {
                const onboarding = await mountStripeConnectOnboarding();
                try {
                    expect(requests).toEqual(["getConnectStatus", "getConnectWallet"]);
                    expect(onboarding.root.querySelector<HTMLElement>("[data-terms-form]")?.hidden).toBeTrue();
                    expect(onboarding.root.querySelector<HTMLElement>("[data-wallet]")?.hidden).toBeFalse();
                    expect(onboarding.root.querySelector<HTMLFormElement>("[data-form]")?.hidden).toBeTrue();
                } finally {
                    onboarding.remove();
                }
            },
        );
    });

    test("fails closed when required published terms are missing or invalid", async () => {
        const invalidRequirements: unknown[] = [
            undefined,
            { version: versionOne, hash: "not-a-sha256" },
            { version: versionOne, hash: hashOne },
            { version: versionOne, hash: hashOne, mode: "published_page", page: { path: "/terms" } },
        ];
        for (const requirement of invalidRequirements) {
            const requests: string[] = [];
            await withFetch(
                async (input) => {
                    const id = functionId(input);
                    requests.push(id);
                    if (id === "getConnectStatus") {
                        return Response.json(activeStatus(false, requirement));
                    }
                    throw new Error(`unexpected seller call: ${id}`);
                },
                async () => {
                    const onboarding = await mountStripeConnectOnboarding();
                    try {
                        expect(requests).toEqual(["getConnectStatus"]);
                        expect(onboarding.root.querySelector<HTMLElement>("[data-terms-form]")?.hidden).toBeTrue();
                        expect(
                            onboarding.root.querySelector<HTMLElement>("[data-terms-unavailable]")?.hidden,
                        ).toBeFalse();
                        expect(onboarding.root.querySelector<HTMLElement>("[data-wallet]")?.hidden).toBeTrue();
                        expect(onboarding.root.querySelector<HTMLFormElement>("[data-form]")?.hidden).toBeTrue();
                    } finally {
                        onboarding.remove();
                    }
                },
            );
        }
    });
});

function activeStatus(currentVersionAccepted: boolean, requirement: unknown): Record<string, unknown> {
    return {
        exists: true,
        connected: true,
        accountStatus: "active",
        onboardingStatus: "enabled",
        payoutsEnabled: true,
        marketplaceTermsStatus: currentVersionAccepted ? "accepted" : "required",
        marketplaceTermsCurrentVersionAccepted: currentVersionAccepted,
        ...(requirement === undefined ? {} : { marketplaceTermsRequirement: requirement }),
    };
}

function inactiveStatus(requirement: unknown): Record<string, unknown> {
    return {
        exists: true,
        connected: false,
        accountStatus: "not_started",
        onboardingStatus: "not_started",
        payoutsEnabled: false,
        marketplaceTermsStatus: "required",
        marketplaceTermsCurrentVersionAccepted: false,
        marketplaceTermsRequirement: requirement,
    };
}

function completeProfile(): Record<string, unknown> {
    return {
        givenName: "Alice",
        surname: "Martin",
        birthDate: "1992-04-17",
        phone: "+33612345678",
        addressLine1: "12 rue des Courts",
        addressLine2: "Bâtiment B",
        postalCode: "75011",
        city: "Paris",
        countryCode: "FR",
    };
}

function accountTermsAttestation(payload: unknown): unknown {
    return (
        payload as {
            identity?: { attestations?: { terms_of_service?: { account?: { shown_and_accepted?: unknown } } } };
        }
    )?.identity?.attestations?.terms_of_service?.account?.shown_and_accepted;
}

function publishedRequirement(
    version: string,
    hash: string,
    overrides: { label?: string; path?: string } = {},
): Record<string, unknown> {
    return {
        mode: "published_page",
        version,
        hash,
        label: overrides.label ?? "Conditions générales vendeur",
        consentText: "J’accepte les conditions générales vendeur.",
        page: { path: overrides.path ?? "/conditions-vendeur" },
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
    return (
        new URL(input instanceof Request ? input.url : String(input), "http://localhost").pathname.split("/").at(-1) ??
        ""
    );
}
