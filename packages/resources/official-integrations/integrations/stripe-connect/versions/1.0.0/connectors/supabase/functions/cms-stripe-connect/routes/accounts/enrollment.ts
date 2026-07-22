import {
    getAccountRow,
    getMarketplaceTermsAcceptance,
    recordMarketplaceTermsAcceptance,
} from "../../db/repositories/accounts.ts";
import { sellerStripeEnrollmentReady } from "../../domain/accounts/eligibility.ts";
import { publicAccount } from "../../domain/accounts/presentation.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    marketplaceTermsExpectationFromBody,
    optionalEmail,
    readJsonObject,
    requiredStripeToken,
} from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { submitCustomVerificationForUser } from "./lifecycle.ts";
import { syncAccountForUser } from "./sync.ts";

export async function connectEnrollment(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await enrollSellerForUser(userId, body));
}

export async function connectVerification(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await submitCustomVerificationForUser(userId, body));
}

async function enrollSellerForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    assertAllowedKeys(body, [
        "accountToken",
        "contactEmail",
        "marketplaceTermsAccepted",
        "marketplaceTermsVersion",
        "marketplaceTermsHash",
    ]);
    const expectedTerms = marketplaceTermsExpectationFromBody(body);
    let current = await syncAccountForUser(userId);
    let recordedTerms =
        current && expectedTerms
            ? await getMarketplaceTermsAcceptance(userId, expectedTerms.version, expectedTerms.hash)
            : null;

    const explicitlyAccepted = body.marketplaceTermsAccepted === true;
    if (body.marketplaceTermsAccepted !== undefined && !explicitlyAccepted) {
        throw new HttpError(400, "marketplaceTermsAccepted must be true when provided");
    }
    if (explicitlyAccepted && !expectedTerms) {
        throw new HttpError(
            400,
            "marketplaceTermsVersion and marketplaceTermsHash are required with marketplaceTermsAccepted",
        );
    }
    if (!recordedTerms && !explicitlyAccepted && !(current?.marketplace_terms_accepted_at && !expectedTerms)) {
        throw new HttpError(409, "current marketplace terms acceptance is required");
    }

    if (!current || !sellerStripeEnrollmentReady(current)) {
        const accountToken = requiredStripeToken(body, "accountToken", "accttok_");
        const contactEmail = optionalEmail(body, "contactEmail");
        await submitCustomVerificationForUser(userId, {
            accountToken,
            ...(contactEmail ? { contactEmail } : {}),
        });
        current = await syncAccountForUser(userId);
        if (!current || !sellerStripeEnrollmentReady(current)) {
            throw new HttpError(409, "Stripe identity and terms acceptance were not confirmed");
        }
    }

    if (expectedTerms && explicitlyAccepted && !recordedTerms) {
        recordedTerms = await recordMarketplaceTermsAcceptance(userId, expectedTerms.version, expectedTerms.hash);
        current = await getAccountRow(userId);
        if (!current) {
            throw new HttpError(502, "could not reload the enrolled seller account");
        }
    }

    return publicAccount(current, { currentTermsAccepted: Boolean(expectedTerms && recordedTerms) });
}
