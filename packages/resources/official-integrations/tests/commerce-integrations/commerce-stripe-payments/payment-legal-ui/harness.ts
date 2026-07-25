import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

let tagSequence = 0;

export type TestPaymentElement = HTMLElement & {
    root: ShadowRoot;
};

export async function mountPaymentElement(): Promise<TestPaymentElement> {
    const tag = `test-commerce-stripe-legal-${++tagSequence}`;
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-stripe-payments",
    );
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "commerce-stripe-payment",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("commerce-stripe-payment source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Commerce",
        artifact.bloc.description ?? "",
        tag,
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
    const element = document.createElement(tag) as TestPaymentElement;
    element.setAttribute("order-id", "42");
    document.body.append(element);
    await settlePaymentLifecycle();
    return element;
}

export async function settlePaymentLifecycle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 45));
    await Promise.resolve();
}

export function submitPayment(element: TestPaymentElement): void {
    element.root
        .querySelector<HTMLFormElement>("[data-form]")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function succeededPayment(): Record<string, unknown> {
    return {
        paymentId: 9,
        clientSecret: "pi_9_secret_test",
        status: "succeeded",
        paymentStatus: "succeeded",
        commercePaymentStatus: "succeeded",
        settlementStatus: "held",
        disputeStatus: "none",
        refundedAmount: 0,
        amountTotal: 12_000,
        buyerTotalAmount: 12_000,
        currency: "EUR",
        financialTermsHash: "terms_hash_42",
    };
}
