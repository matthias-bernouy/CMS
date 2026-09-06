import { afterEach, expect, test } from "bun:test";
import { mountStripeConnectOnboarding } from "./harness";

const originalFetch = globalThis.fetch;

afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
});

test("uses configured missing-profile labels and payment-consent copy", async () => {
    globalThis.fetch = (async (input) => {
        const path = String(input);
        return Response.json(path.includes("getAccount") ? { givenName: "Ada" } : inactiveStatus());
    }) as typeof fetch;
    const bloc = await mountStripeConnectOnboarding({
        "missing-profile-message": "À compléter : {fields}.",
        "profile-surname-label": "nom",
        "profile-birth-date-label": "date de naissance",
        "profile-phone-label": "téléphone",
        "profile-address-label": "adresse",
        "profile-postal-code-label": "code postal",
        "profile-city-label": "ville",
        "profile-country-label": "pays",
        "activate-profile-message": "Complète ton profil avant de continuer.",
        "payment-consent-prefix": "J’accepte les ",
        "payment-consent-suffix": ".",
        "loading-label": "Chargement du compte vendeur",
        "terms-unavailable-title": "Conditions indisponibles",
    });
    await bloc.prepareActivation();
    expect(bloc.root.querySelector("[data-missing-copy]")?.textContent).toBe(
        "À compléter : nom, date de naissance, téléphone, adresse, code postal, ville, pays.",
    );
    expect(bloc.root.querySelector("[data-status]")?.textContent).toBe("Complète ton profil avant de continuer.");
    expect(bloc.root.querySelector("[data-payment-consent-prefix]")?.textContent).toBe("J’accepte les ");
    expect(bloc.root.querySelector("[data-payment-consent-suffix]")?.textContent).toBe(".");
    expect(bloc.root.querySelector("[data-loading]")?.getAttribute("aria-label")).toBe("Chargement du compte vendeur");
    expect(bloc.root.querySelector("[data-terms-unavailable-title]")?.textContent).toBe("Conditions indisponibles");
    const style = bloc.root.querySelector("style")?.textContent ?? "";
    expect(style).toContain("--_mossa-wallet-accent-text: var(--ulvia-secondary-foreground)");
});

test("localizes pending verification and sanitized errors without exposing private provider details", async () => {
    globalThis.fetch = (async () =>
        Response.json({
            ...inactiveStatus(),
            onboardingStatus: "enabled",
            bankAccountStatus: "attached",
            bankPayoutsStatus: "pending",
        })) as typeof fetch;
    const bloc = await mountStripeConnectOnboarding({
        "verification-pending-message": "Tes informations sont en cours de vérification.",
        "error-message": "Réessaie dans quelques instants.",
    });
    expect(bloc.root.querySelector("[data-status]")?.textContent).toBe(
        "Tes informations sont en cours de vérification.",
    );
    (bloc as typeof bloc & { showError(error: Error): void }).showError(new Error("private provider credential"));
    expect(bloc.root.querySelector("[data-status]")?.textContent).toBe("Réessaie dans quelques instants.");
    expect(bloc.root.textContent).not.toContain("private provider credential");
});

function inactiveStatus() {
    return {
        onboardingStatus: "not_started",
        payoutsEnabled: false,
        marketplaceTermsCurrentVersionAccepted: false,
        marketplaceTermsRequirement: { mode: "legacy", version: "seller-v1", hash: "a".repeat(64) },
    };
}
