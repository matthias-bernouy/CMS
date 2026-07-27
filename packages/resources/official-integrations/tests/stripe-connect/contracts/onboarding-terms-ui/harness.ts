import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

let tagSequence = 0;

export type TestStripeConnectOnboardingElement = HTMLElement & {
    root: ShadowRoot;
    refresh(): Promise<void>;
    prepareActivation(): Promise<void>;
    clientConfig(): Promise<{ publishableKey: string }>;
    createAccountToken(publishableKey: string, payload: unknown): Promise<string>;
    createBankAccountToken(publishableKey: string, payload: unknown): Promise<string>;
    submitMarketplaceTermsAcceptance(): Promise<void>;
};

export async function mountStripeConnectOnboarding(
    attributes: Record<string, string> = {},
): Promise<TestStripeConnectOnboardingElement> {
    const tag = `test-stripe-connect-onboarding-terms-${++tagSequence}`;
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("stripe-connect");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "stripe-connect-onboarding",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("stripe-connect-onboarding source not found");
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
    const element = document.createElement(tag) as TestStripeConnectOnboardingElement;
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    document.body.append(element);
    await settleOnboardingLifecycle();
    return element;
}

export async function settleOnboardingLifecycle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 45));
    await Promise.resolve();
}

export function submitMarketplaceTerms(element: TestStripeConnectOnboardingElement): void {
    element.root
        .querySelector<HTMLFormElement>("[data-terms-form]")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function submitInitialOnboarding(element: TestStripeConnectOnboardingElement): void {
    element.root
        .querySelector<HTMLFormElement>("[data-form]")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}
