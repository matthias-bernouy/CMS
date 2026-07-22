import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../../harness";
import type { PaymentCreationState } from "../checkout/index";
import { assertProtectedRefund } from "./refund";
import { assertSettlementRelease } from "./release";

export async function assertSettlementContracts(
    context: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { sellerPayoutBody }: PaymentCreationState,
): Promise<void> {
    await assertSettlementRelease(context, identities, sellerPayoutBody);
    await assertProtectedRefund(context, identities);
}
