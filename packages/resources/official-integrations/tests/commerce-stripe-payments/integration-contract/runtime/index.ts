import { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../harness";
import { assertCheckoutContracts } from "./checkout/index";
import { assertSellerContracts } from "./seller/index";
import { assertSettlementContracts } from "./settlement/index";
import { assertPaymentStatusContracts } from "./status/index";
import { assertWorkerContracts } from "./workers/index";

export async function assertRuntimeContracts(context: IntegrationContractContext): Promise<void> {
    const identities = new InMemoryIdentityService();
    const paymentState = await assertCheckoutContracts(context, identities);
    await assertPaymentStatusContracts(context, identities);
    await assertSettlementContracts(context, identities, paymentState);
    await assertWorkerContracts(context, identities);
    await assertSellerContracts(context, identities);
}
