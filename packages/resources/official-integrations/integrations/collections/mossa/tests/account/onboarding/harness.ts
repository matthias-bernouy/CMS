import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Buffer } from "node:buffer";
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
    configureLightDom?: (element: TestStripeConnectOnboardingElement) => void,
): Promise<TestStripeConnectOnboardingElement> {
    const tag = `test-mossa-stripe-connect-onboarding-terms-${++tagSequence}`;
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
    const element = document.createElement(tag) as TestStripeConnectOnboardingElement;
    const manifest = JSON.parse(Buffer.from(artifact.bloc.source?.["manifest.json"] ?? "", "base64").toString()) as {
        defaultContent: string;
    };
    const defaultSource = artifact.bloc.source?.[manifest.defaultContent.replace(/^\.\//u, "")];
    const template = document.createElement("template");
    template.innerHTML = Buffer.from(defaultSource ?? "", "base64").toString();
    element.append(
        ...Array.from(template.content.firstElementChild?.children ?? []).map((child) => child.cloneNode(true)),
    );
    element.setAttribute("locale", "fr-FR");
    element.setAttribute("payout-currency", "EUR");
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    configureLightDom?.(element);
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
