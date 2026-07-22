import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../../harness";
import { assertSellerEnrollment } from "./enrollment";
import { assertSellerEnrollmentFailures } from "./failures";
import { assertFirstSellerPrice } from "./first-price";
import { assertSellerTermsRenewal } from "./renewal";
import { assertSellerPriceReplay } from "./replay";
import { assertSellerInputValidation } from "./validation";

export async function assertSellerContracts(
    context: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const sellerState = await assertSellerEnrollment(context, identities);
    await assertSellerInputValidation(context, identities, sellerState);
    await assertFirstSellerPrice(context, identities, sellerState);
    await assertSellerPriceReplay(context, identities, sellerState);
    await assertSellerTermsRenewal(context, identities, sellerState);
    await assertSellerEnrollmentFailures(context, identities, sellerState);
}
