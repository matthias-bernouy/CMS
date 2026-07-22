import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../../harness";
import { assertMissingPaymentRefresh } from "./missing";
import { assertPaymentReads } from "./read";
import { assertPaymentRefresh } from "./refresh";

export async function assertPaymentStatusContracts(
    context: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    await assertPaymentRefresh(context, identities);
    await assertPaymentReads(context, identities);
    await assertMissingPaymentRefresh(context, identities);
}
