import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../../harness";
import { assertPaymentCreation } from "./creation";
import { assertProtectedOrderCreation } from "./protected-order";
import { assertCheckoutReplay } from "./replay";

export type PaymentCreationState = Awaited<ReturnType<typeof assertPaymentCreation>>;

export async function assertCheckoutContracts(
    context: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<PaymentCreationState> {
    const paymentState = await assertPaymentCreation(context, identities);
    await assertProtectedOrderCreation(context, identities);
    await assertCheckoutReplay(context, identities, paymentState);
    return paymentState;
}
