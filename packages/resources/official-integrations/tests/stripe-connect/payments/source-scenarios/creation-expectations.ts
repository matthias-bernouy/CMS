import { expect } from "bun:test";

type ImportedBloc = {
    editorJS?: string;
    viewJS?: string;
};

export function expectWalletBlocContract(bloc: ImportedBloc | undefined): void {
    expect(bloc?.viewJS).toContain("Compte vendeur");
    expect(bloc?.viewJS).toContain("Active et suis ton compte vendeur pour recevoir les versements de tes ventes.");
    expect(bloc?.viewJS).toContain("Configurer mon compte vendeur");
    expect(bloc?.viewJS).toContain("Renseigne le compte bancaire sur lequel recevoir tes versements.");
    expect(bloc?.viewJS).not.toContain('"Compte vendeur Stripe"');
    expect(bloc?.viewJS).not.toContain('"compte Stripe Connect"');
    expect(bloc?.viewJS).not.toContain('"vers ton compte Stripe');
    expect(bloc?.viewJS).toContain("providerNeutralCopy(this.getAttribute(attribute))");
    expect(bloc?.viewJS).toContain('.replace(/Compte vendeur Stripe/gi, "Compte vendeur")');
    expect(bloc?.viewJS).toContain('.replace(/compte Stripe Connect/gi, "compte vendeur")');
    expect(bloc?.viewJS).toContain("submitConnectVerification");
    expect(bloc?.viewJS).toContain("Validation en attente.");
    expect(bloc?.viewJS).toContain('status?.bankPayoutsStatus === "pending"');
    expect(bloc?.viewJS).toContain('status?.bankAccountStatus === "attached"');
    expect(bloc?.viewJS).toContain('["requirements_due", "rejected"].includes');
    expect(bloc?.viewJS).toContain("this.showPendingVerification();");
    expect(bloc?.viewJS).not.toContain("await this.refresh();");
    expect(bloc?.viewJS).toContain('requestStripeSource("getConnectStatus")');
    expect(bloc?.viewJS).toContain(
        "this.marketplaceTermsRequirement = marketplaceTermsRequirement(status?.marketplaceTermsRequirement)",
    );
    expect(bloc?.viewJS).toContain("publishedMarketplaceTermsRequirement(this.marketplaceTermsRequirement)");
    expect(bloc?.viewJS).toContain("requirement?.consentText");
    expect(bloc?.viewJS).toContain("requirement?.label");
    expect(bloc?.viewJS).toContain("requirement?.page.path");
    expect(bloc?.viewJS).toContain('name="termsAccepted" required');
    expect(bloc?.viewJS).toContain("marketplaceTermsAccepted: true");
    expect(bloc?.viewJS).toMatch(/expectedMarketplaceTermsVersion:\s*marketplaceTerms\.version/);
    expect(bloc?.viewJS).toMatch(/expectedMarketplaceTermsHash:\s*marketplaceTerms\.hash/);
    expect(bloc?.viewJS).toContain('error.message === "MARKETPLACE_TERMS_VERSION_CHANGED"');
    expect(bloc?.viewJS).toContain(`this.form.querySelector("[name='termsAccepted']").checked = false`);
    expect(bloc?.viewJS).toContain("await this.refresh()");
    expect(bloc?.viewJS).toContain("Les conditions vendeur ont changé. Relis la nouvelle version avant de continuer.");
    expect(bloc?.viewJS).toContain('requestAccountSource("getAccount")');
    expect(bloc?.viewJS).toContain('requestAuthSource("me")');
    expect(bloc?.viewJS).toContain("currentAccount?.subject?.email");
    expect(bloc?.viewJS).toContain('|| "system-auth"');
    expect(bloc?.viewJS).toContain('requestStripeSource("getConnectWallet")');
    expect(bloc?.viewJS).not.toContain("seller-eligibility-function-id");
    expect(bloc?.viewJS).not.toContain("seller-sync-function-id");
    expect(bloc?.viewJS).not.toContain("synchronizeSellerEligibility");
    expect(bloc?.viewJS).not.toContain("system-functions");
    expect(bloc?.viewJS).not.toContain("createConnectPayout");
    expect(bloc?.editorJS).not.toContain("Payout button");
    expect(bloc?.viewJS).toContain("Complète les informations suivantes");
    expect(bloc?.viewJS).toContain("Nous ne conservons pas ton IBAN");
    expect(bloc?.viewJS).toContain('Intl.NumberFormat("fr-FR"');
    expect(bloc?.viewJS).toContain("--wallet-accent");
    expect(bloc?.viewJS).not.toContain("CmsCore receives it");
    expect(bloc?.viewJS).not.toContain("Stripe must verify");
    expect(bloc?.viewJS).not.toContain('"given-name"');
    expect(bloc?.viewJS).not.toContain('"address-line1"');
    expect(bloc?.viewJS).not.toContain("Date of birth");
    expect(bloc?.viewJS).not.toContain("source-prefix");
    expect(bloc?.viewJS).not.toContain("account-onboarding");
    expect(bloc?.editorJS).toContain("User Account source");
    expect(bloc?.editorJS).toContain("Authentication source");
    expect(bloc?.editorJS).toContain('type: "color"');
    expect(bloc?.editorJS).toContain("IBAN privacy notice");
    expect(bloc?.editorJS).not.toContain("address-line1");
}
