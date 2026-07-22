import { getMarketplaceTermsAcceptance } from "../../db/repositories/accounts.ts";
import { getPaymentByClientReference, getPaymentRow } from "../../db/repositories/payments.ts";
import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import { sellerCanAcceptHeldPayments } from "../../domain/accounts/eligibility.ts";
import { publicPayment } from "../../domain/payments/presentation.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    marketplaceTermsExpectationFromBody,
    readJsonObject,
    requiredString,
} from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";
import { requiredQueryInteger, requiredQueryText } from "../../http/query.ts";
import { json } from "../../http/responses.ts";
import { syncPayment } from "../../workflows/payments/projection.ts";
import type { CreateProtectedPaymentForBuyer } from "../../workflows/payments/creation/workflow.ts";

type ProtectedPaymentRouteDependencies = {
    createProtectedPaymentForBuyer: CreateProtectedPaymentForBuyer;
    syncAccountForIdentity(identity: string): Promise<ConnectAccountRow | null>;
};

export function createProtectedPaymentRoutes({
    createProtectedPaymentForBuyer,
    syncAccountForIdentity,
}: ProtectedPaymentRouteDependencies) {
    return {
        createProtectedPayment: async (request: Request): Promise<Response> => {
            const { userId: buyerUserId } = requireCmsRequest(request);
            const body = await readJsonObject(request);
            return json(await createProtectedPaymentForBuyer(buyerUserId, body));
        },
        checkSellerHeldPaymentEligibility: async (request: Request): Promise<Response> => {
            const { userId: buyerUserId } = requireCmsRequest(request);
            const body = await readJsonObject(request);
            assertAllowedKeys(body, ["sellerUserId", "marketplaceTermsVersion", "marketplaceTermsHash"]);
            const sellerIdentity = requiredString(body, "sellerUserId", 200);
            const expectedTerms = marketplaceTermsExpectationFromBody(body);
            if (!expectedTerms) {
                throw new HttpError(400, "marketplaceTermsVersion and marketplaceTermsHash are required");
            }
            const seller = await syncAccountForIdentity(sellerIdentity);
            if (!seller?.stripe_account_id) {
                return json({ eligible: false, reasonCode: "seller_account_missing" });
            }
            if (seller.cms_user_id === buyerUserId) {
                return json({ eligible: false, reasonCode: "buyer_is_seller" });
            }
            const currentTermsAccepted = Boolean(
                await getMarketplaceTermsAcceptance(seller.cms_user_id, expectedTerms.version, expectedTerms.hash),
            );
            if (!currentTermsAccepted) {
                return json({ eligible: false, reasonCode: "seller_terms_not_current" });
            }
            if (!sellerCanAcceptHeldPayments(seller)) {
                return json({ eligible: false, reasonCode: "seller_account_not_ready" });
            }
            return json({ eligible: true, reasonCode: "eligible" });
        },
        getProtectedPayment: async (request: Request): Promise<Response> => {
            const { userId } = requireCmsRequest(request);
            const paymentId = requiredQueryInteger(request, "paymentId");
            const payment = await getPaymentRow(paymentId);
            if (!payment) {
                throw new HttpError(404, "payment not found");
            }
            if (payment.buyer_cms_user_id !== userId && payment.seller_cms_user_id !== userId) {
                throw new HttpError(403, "payment is not visible to this user");
            }
            return json(publicPayment(await syncPayment(payment)));
        },
        getProtectedPaymentByReference: async (request: Request): Promise<Response> => {
            const { userId } = requireCmsRequest(request);
            const clientReferenceId = requiredQueryText(request, "clientReferenceId", 200);
            const payment = await getPaymentByClientReference(clientReferenceId);
            if (!payment || payment.buyer_cms_user_id !== userId) {
                return json({ exists: false });
            }
            return json({ exists: true, payment: publicPayment(await syncPayment(payment)) });
        },
    };
}
