import {
    getAccountRow,
    getMarketplaceTermsAcceptance,
    recordMarketplaceTermsAcceptance,
} from "../../db/repositories/accounts.ts";
import {
    effectiveMarketplaceTermsExpectation,
    getCurrentMarketplaceTermsConfiguration,
    marketplaceTermsRequirement,
    recordCurrentMarketplaceTermsAcceptance,
} from "./marketplace-terms/repository.ts";
import { sellerStripeEnrollmentReady } from "../../domain/accounts/eligibility.ts";
import { publicAccount } from "../../domain/accounts/presentation.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    marketplaceTermsAcceptanceExpectationFromBody,
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
    assertAllowedKeys(body, [
        "accountToken",
        "bankAccountToken",
        "contactEmail",
        "marketplaceTermsAccepted",
        "expectedMarketplaceTermsVersion",
        "expectedMarketplaceTermsHash",
    ]);
    const hasMarketplaceTermsSubmission = [
        "marketplaceTermsAccepted",
        "expectedMarketplaceTermsVersion",
        "expectedMarketplaceTermsHash",
    ].some((key) => body[key] !== undefined);
    if (!hasMarketplaceTermsSubmission) {
        return json(await submitCustomVerificationForUser(userId, verificationBody(body)));
    }
    const explicitlyAccepted = body.marketplaceTermsAccepted === true;
    if (body.marketplaceTermsAccepted !== undefined && !explicitlyAccepted) {
        throw new HttpError(400, "marketplaceTermsAccepted must be true when provided");
    }
    const acceptanceExpectation = marketplaceTermsAcceptanceExpectationFromBody(body);
    if (acceptanceExpectation && !explicitlyAccepted) {
        throw new HttpError(400, "expected marketplace terms evidence requires explicit acceptance");
    }
    const configuredTerms = await getCurrentMarketplaceTermsConfiguration();
    if (
        explicitlyAccepted &&
        (!configuredTerms ||
            !acceptanceExpectation ||
            acceptanceExpectation.version !== configuredTerms.version ||
            acceptanceExpectation.hash !== configuredTerms.hash)
    ) {
        throw new HttpError(409, "MARKETPLACE_TERMS_VERSION_CHANGED");
    }
    await submitCustomVerificationForUser(userId, verificationBody(body));
    if (explicitlyAccepted) {
        await recordCurrentMarketplaceTermsAcceptance(userId, acceptanceExpectation);
    }
    const account = await getAccountRow(userId);
    if (!account) {
        throw new HttpError(502, "could not reload the verified seller account");
    }
    const recordedTerms = configuredTerms
        ? await getMarketplaceTermsAcceptance(userId, configuredTerms.version, configuredTerms.hash)
        : null;
    return json(
        publicAccount(account, {
            currentTermsAccepted: Boolean(recordedTerms),
            ...(configuredTerms ? { marketplaceTermsRequirement: marketplaceTermsRequirement(configuredTerms) } : {}),
        }),
    );
}

async function enrollSellerForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    assertAllowedKeys(body, [
        "accountToken",
        "contactEmail",
        "marketplaceTermsAccepted",
        "marketplaceTermsVersion",
        "marketplaceTermsHash",
        "expectedMarketplaceTermsVersion",
        "expectedMarketplaceTermsHash",
    ]);
    const explicitTerms = marketplaceTermsExpectationFromBody(body);
    const acceptanceExpectation = marketplaceTermsAcceptanceExpectationFromBody(body);
    const explicitlyAccepted = body.marketplaceTermsAccepted === true;
    if (body.marketplaceTermsAccepted !== undefined && !explicitlyAccepted) {
        throw new HttpError(400, "marketplaceTermsAccepted must be true when provided");
    }
    const configuredTerms = await getCurrentMarketplaceTermsConfiguration();
    const expectedTerms = effectiveMarketplaceTermsExpectation(explicitTerms, configuredTerms);
    if (explicitlyAccepted && !expectedTerms) {
        throw new HttpError(
            400,
            "marketplaceTermsVersion and marketplaceTermsHash are required with marketplaceTermsAccepted",
        );
    }
    if (acceptanceExpectation && !explicitlyAccepted) {
        throw new HttpError(400, "expected marketplace terms evidence requires explicit acceptance");
    }
    if (
        explicitlyAccepted &&
        acceptanceExpectation &&
        (acceptanceExpectation.version !== expectedTerms?.version || acceptanceExpectation.hash !== expectedTerms?.hash)
    ) {
        throw new HttpError(409, "MARKETPLACE_TERMS_VERSION_CHANGED");
    }
    if (explicitlyAccepted && configuredTerms?.mode === "published_page" && !acceptanceExpectation) {
        throw new HttpError(409, "MARKETPLACE_TERMS_VERSION_CHANGED");
    }
    const acceptsConfiguredTerms =
        Boolean(configuredTerms) &&
        configuredTerms?.version === expectedTerms?.version &&
        configuredTerms?.hash === expectedTerms?.hash;
    let current = await syncAccountForUser(userId);
    let recordedTerms =
        current && expectedTerms
            ? await getMarketplaceTermsAcceptance(userId, expectedTerms.version, expectedTerms.hash)
            : null;

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
        recordedTerms = acceptsConfiguredTerms
            ? await recordCurrentMarketplaceTermsAcceptance(userId, acceptanceExpectation)
            : await recordMarketplaceTermsAcceptance(userId, expectedTerms.version, expectedTerms.hash);
        current = await getAccountRow(userId);
        if (!current) {
            throw new HttpError(502, "could not reload the enrolled seller account");
        }
    }

    return publicAccount(current, {
        currentTermsAccepted: Boolean(expectedTerms && recordedTerms),
        marketplaceTermsRequirement: marketplaceTermsRequirement(configuredTerms),
    });
}

function verificationBody(body: JsonRecord): JsonRecord {
    return Object.fromEntries(
        ["accountToken", "bankAccountToken", "contactEmail"]
            .filter((key) => body[key] !== undefined)
            .map((key) => [key, body[key]]),
    );
}
