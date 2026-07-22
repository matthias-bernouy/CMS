import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../../harness";
import { assertCancellationWorker } from "./cancellations";
import { assertDeadlineWorker } from "./deadlines";
import { assertReconciliationWorker } from "./reconciliation";
import { assertRefundWorker } from "./refunds";
import { assertSettlementWorker } from "./settlements";

export async function assertWorkerContracts(
    context: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    await assertDeadlineWorker(context, identities);
    await assertCancellationWorker(context, identities);
    await assertSettlementWorker(context, identities);
    await assertRefundWorker(context, identities);
    await assertReconciliationWorker(context, identities);
}
