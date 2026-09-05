import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const tag = "test-mossa-stripe-connect-onboarding-pending";

type OnboardingBloc = HTMLElement & {
    profile: Record<string, string> | null;
    marketplaceTermsRequirement: Record<string, unknown> | null;
    render(): void;
    syncPresentation(): void;
    refresh(): Promise<void>;
    submit(): Promise<void>;
    requestStripeSource(endpoint: string, init?: RequestInit): Promise<Record<string, unknown>>;
    clientConfig(): Promise<{ publishableKey: string }>;
    createAccountToken(): Promise<string>;
    createBankAccountToken(): Promise<string>;
};

beforeAll(async () => {
    await defineBloc();
});

afterEach(() => {
    document.body.replaceChildren();
});

describe("stripe connect onboarding pending verification", () => {
    test("keeps every validation action hidden while bank payouts are pending", async () => {
        const bloc = createBloc();
        bloc.requestStripeSource = async () =>
            statusWithTerms({
                onboardingStatus: "enabled",
                payoutsEnabled: false,
                bankAccountStatus: "attached",
                bankPayoutsStatus: "pending",
            });

        await bloc.refresh();

        expect(pendingSnapshot(bloc)).toEqual({
            message: "Verification pending. Your information is being reviewed and this may take a few minutes.",
            activationHidden: true,
            formHidden: true,
            walletHidden: true,
        });
    });

    test("keeps an attached bank account locked during the first provider propagation", async () => {
        const bloc = createBloc();
        bloc.requestStripeSource = async () =>
            statusWithTerms({
                onboardingStatus: "enabled",
                payoutsEnabled: false,
                bankAccountStatus: "attached",
                bankPayoutsStatus: "unrequested",
            });

        await bloc.refresh();

        expect(pendingSnapshot(bloc).activationHidden).toBe(true);
        expect(pendingSnapshot(bloc).message).toStartWith("Verification pending.");
    });

    test("keeps mixed provider requirements locked while verification is still pending", async () => {
        const bloc = createBloc();
        bloc.requestStripeSource = async () =>
            statusWithTerms({
                onboardingStatus: "requirements_due",
                payoutsEnabled: false,
                bankAccountStatus: "attached",
                bankPayoutsStatus: "restricted",
                pendingVerification: ["identity.document"],
            });

        await bloc.refresh();

        expect(pendingSnapshot(bloc).activationHidden).toBe(true);
        expect(pendingSnapshot(bloc).message).toStartWith("Verification pending.");
    });

    test("allows correction only when the provider reports an actionable terminal state", async () => {
        const bloc = createBloc();
        bloc.requestStripeSource = async () =>
            statusWithTerms({
                onboardingStatus: "requirements_due",
                payoutsEnabled: false,
                bankAccountStatus: "attached",
                bankPayoutsStatus: "restricted",
                pendingVerification: [],
            });

        await bloc.refresh();

        const snapshot = pendingSnapshot(bloc);
        expect(snapshot.activationHidden).toBe(false);
        expect(snapshot.message).toBe("More information is required. Check your profile first.");
    });

    test("shows the locked pending state immediately after a successful submission", async () => {
        const bloc = createBloc();
        const endpoints: string[] = [];
        bloc.profile = completeProfile();
        bloc.marketplaceTermsRequirement = legacyTermsRequirement();
        bloc.clientConfig = async () => ({ publishableKey: "pk_test_123" });
        bloc.createAccountToken = async () => "accttok_test_123";
        bloc.createBankAccountToken = async () => "btok_test_123";
        bloc.requestStripeSource = async (endpoint) => {
            endpoints.push(endpoint);
            return {
                onboardingStatus: "enabled",
                payoutsEnabled: false,
                bankAccountStatus: "attached",
                bankPayoutsStatus: "unrequested",
            };
        };
        const iban = bloc.shadowRoot?.querySelector<HTMLInputElement>("[name='iban']");
        const marketplaceConsent = bloc.shadowRoot?.querySelector<HTMLInputElement>(
            "[data-form] [name='marketplaceTermsAccepted']",
        );
        const paymentConsent = bloc.shadowRoot?.querySelector<HTMLInputElement>(
            "[data-form] [name='paymentTermsAccepted']",
        );
        const email = bloc.shadowRoot?.querySelector<HTMLInputElement>("[data-form] [name='email']");
        if (!iban || !marketplaceConsent || !paymentConsent || !email) {
            throw new Error("onboarding form was not rendered");
        }
        email.value = "ada@example.com";
        iban.value = "FR7612345678901234567890123";
        marketplaceConsent.checked = true;
        paymentConsent.checked = true;

        await bloc.submit();

        expect(endpoints).toEqual(["submitConnectVerification"]);
        expect(pendingSnapshot(bloc)).toEqual({
            message: "Verification pending. Your information is being reviewed and this may take a few minutes.",
            activationHidden: true,
            formHidden: true,
            walletHidden: true,
        });
    });
});

function createBloc(): OnboardingBloc {
    const bloc = document.createElement(tag) as OnboardingBloc;
    bloc.render();
    bloc.syncPresentation();
    return bloc;
}

function pendingSnapshot(bloc: OnboardingBloc) {
    const root = bloc.shadowRoot;
    if (!root) {
        throw new Error("onboarding shadow root is missing");
    }
    return {
        message: root.querySelector("[data-status]")?.textContent,
        activationHidden: root.querySelector<HTMLElement>("[data-activation]")?.hidden,
        formHidden: root.querySelector<HTMLElement>("[data-form]")?.hidden,
        walletHidden: root.querySelector<HTMLElement>("[data-wallet]")?.hidden,
    };
}

function completeProfile(): Record<string, string> {
    return {
        givenName: "Ada",
        surname: "Lovelace",
        birthDate: "1990-01-02",
        email: "ada@example.com",
        phone: "+33612345678",
        addressLine1: "1 Test Street",
        addressLine2: "",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
    };
}

function statusWithTerms(status: Record<string, unknown>): Record<string, unknown> {
    return {
        ...status,
        marketplaceTermsStatus: "required",
        marketplaceTermsCurrentVersionAccepted: false,
        marketplaceTermsRequirement: legacyTermsRequirement(),
    };
}

function legacyTermsRequirement(): Record<string, unknown> {
    return {
        mode: "legacy",
        version: "seller-terms-2026-07",
        hash: "a".repeat(64),
    };
}

async function defineBloc(): Promise<void> {
    if (customElements.get(tag)) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "mossa-stripe-connect-onboarding",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("mossa-stripe-connect-onboarding source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Stripe Connect",
        artifact.bloc.description ?? "",
        tag,
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
}
