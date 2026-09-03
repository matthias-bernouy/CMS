import { jsonResponse } from "../../../http";
import { asRecord, same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handlePaymentReservationRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/get_current_marketplace_terms_configuration" && method === "POST") {
        return jsonResponse(mock.currentMarketplaceTermsConfiguration);
    }
    if (table === "rpc/publish_marketplace_terms_configuration" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const current = mock.currentMarketplaceTermsConfiguration;
        if ((current?.version ?? "new") !== body.p_expected_version) {
            return jsonResponse({ message: "conflict: MARKETPLACE_TERMS_VERSION_CHANGED" }, 400);
        }
        const document = asRecord(body.p_document);
        const configuration = {
            mode: "published_page",
            termsVersionId: "terms-version-runtime",
            version: `cms-page:${document.revisionHash}`,
            hash: document.contentHash,
            documentKey: document.documentKey,
            label: document.label,
            consentText: document.consentText,
            page: document.page,
            publishedSnapshotUrl: document.publishedSnapshotUrl,
            updatedAt: "2026-07-25T12:00:00.000Z",
        };
        mock.setCurrentMarketplaceTermsConfiguration(configuration);
        return jsonResponse(configuration);
    }
    if (table === "rpc/record_current_marketplace_terms_acceptance" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const userId = String(body.p_cms_user_id);
        const configuration = mock.currentMarketplaceTermsConfiguration;
        const account = mock.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            return jsonResponse({ message: "not_found: Stripe Connect account" }, 400);
        }
        if (!configuration || typeof configuration.version !== "string" || typeof configuration.hash !== "string") {
            return jsonResponse({ message: "not_found: marketplace terms configuration" }, 400);
        }
        const expectedVersion = body.p_expected_version;
        const expectedHash = body.p_expected_hash;
        if (
            (expectedVersion === null) !== (expectedHash === null) ||
            (configuration.mode === "published_page" && (expectedVersion === null || expectedHash === null)) ||
            (expectedVersion !== null &&
                (expectedVersion !== configuration.version || expectedHash !== configuration.hash))
        ) {
            return jsonResponse({ message: "conflict: MARKETPLACE_TERMS_VERSION_CHANGED" }, 400);
        }
        let acceptance = mock.tables.marketplace_terms_acceptances.find(
            (row) => row.cms_user_id === userId && row.terms_version === configuration.version,
        );
        if (!acceptance) {
            acceptance = {
                cms_user_id: userId,
                terms_version: configuration.version,
                terms_hash: configuration.hash,
                terms_version_id: configuration.termsVersionId ?? null,
                accepted_at: "2026-07-06T12:03:00.000Z",
            };
            mock.tables.marketplace_terms_acceptances.push(acceptance);
        }
        if (
            acceptance.terms_hash !== configuration.hash ||
            acceptance.terms_version_id !== (configuration.termsVersionId ?? null)
        ) {
            return jsonResponse(
                { message: "conflict: marketplace terms acceptance evidence does not match the configured revision" },
                400,
            );
        }
        const previousAcceptedAt = Date.parse(String(account.marketplace_terms_accepted_at ?? ""));
        const acceptedAt = Date.parse(String(acceptance.accepted_at));
        if (!Number.isFinite(previousAcceptedAt) || acceptedAt >= previousAcceptedAt) {
            mock.update(account, {
                marketplace_terms_version: acceptance.terms_version,
                marketplace_terms_hash: acceptance.terms_hash,
                marketplace_terms_accepted_at: acceptance.accepted_at,
            });
        }
        return jsonResponse(acceptance);
    }
    if (table === "rpc/reserve_protected_payment" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const payment = asRecord(body.p_payment);
        const reference = String(payment.client_reference_id);
        if (mock.nextProtectedPaymentReservationFailure === "missing") {
            mock.nextProtectedPaymentReservationFailure = null;
            return jsonResponse({ message: "simulated protected payment reservation failure" }, 500);
        }
        let guard = mock.tables.payment_lifecycle_guards.find((row) => row.client_reference_id === reference);
        if (guard?.cancellation_request_id) {
            return jsonResponse(
                { message: "conflict: protected payment creation was cancelled before provider creation" },
                400,
            );
        }
        const existing = mock.tables.payments.find((row) => row.client_reference_id === reference);
        const reserved = existing ?? mock.insertPayment(payment);
        const stored = mock.tables.payments.find((row) => row.client_reference_id === reference)!;
        if (!guard) {
            guard = mock.insertGeneric("payment_lifecycle_guards", {
                client_reference_id: reference,
                payment_id: stored.id,
                cancellation_request_id: null,
                cancellation_reason: null,
                cancellation_requested_at: null,
                payment_linked_at: reserved.created_at,
            });
        } else {
            mock.update(guard, {
                payment_id: reserved.id,
                payment_linked_at: guard.payment_linked_at ?? reserved.created_at,
            });
        }
        if (mock.linkNextProtectedPaymentReservation) {
            mock.linkNextProtectedPaymentReservation = false;
            const intent = mock.seedPaymentIntent(stored);
            mock.update(stored, { stripe_payment_intent_id: intent.id });
        }
        if (mock.nextProtectedPaymentReservationFailure === "raced") {
            mock.nextProtectedPaymentReservationFailure = null;
            return jsonResponse({ message: "simulated protected payment reservation failure" }, 500);
        }
        return jsonResponse({ ...stored });
    }
    if (table === "rpc/apply_payment_provider_projection" && method === "POST") {
        return mock.applyPaymentProviderProjection(JSON.parse(await request.text()) as JsonRecord);
    }
    if (table === "rpc/recover_transient_provider_truth_review" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        const payment = mock.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            return jsonResponse({ message: "not_found: payment" }, 400);
        }
        const reason = "Stripe payment provider truth mismatch: charge_balance_transaction_expansion";
        const exceptionKey = `provider-payment-truth:${paymentId}:${body.p_payment_intent_id}`;
        const hasRecoveryException = mock.tables.provider_exceptions.some(
            (row) =>
                same(row.payment_id, paymentId) &&
                ["open", "investigating"].includes(String(row.status)) &&
                row.deduplication_key === exceptionKey,
        );
        const hasOtherException = mock.tables.provider_exceptions.some(
            (row) =>
                same(row.payment_id, paymentId) &&
                ["open", "investigating"].includes(String(row.status)) &&
                row.deduplication_key !== exceptionKey,
        );
        const recovered =
            payment.payment_status === "succeeded" &&
            payment.settlement_status === "manual_review" &&
            payment.manual_review_reason === reason &&
            payment.stripe_payment_intent_id === body.p_payment_intent_id &&
            payment.stripe_charge_id === body.p_charge_id &&
            payment.stripe_charge_balance_transaction_id === body.p_balance_transaction_id &&
            Number(payment.transferred_amount) === 0 &&
            Number(payment.reversed_amount) === 0 &&
            Number(payment.refunded_amount) === 0 &&
            payment.dispute_status === "none" &&
            hasRecoveryException &&
            !hasOtherException;
        if (!recovered) {
            return jsonResponse({ recovered: false, payment });
        }
        mock.update(payment, { settlement_status: "held", manual_review_reason: null });
        for (const exception of mock.tables.provider_exceptions) {
            if (
                exception.deduplication_key !== exceptionKey ||
                !["open", "investigating"].includes(String(exception.status))
            ) {
                continue;
            }
            mock.update(exception, {
                status: "resolved",
                resolved_at: "2026-07-06T12:10:00.000Z",
                resolved_by: "provider-truth-revalidation",
            });
        }
        mock.insertGeneric("payment_events", {
            payment_id: paymentId,
            event_type: "provider_payment_truth_revalidated",
            actor_kind: body.p_actor_kind,
            actor_id: body.p_actor_id,
            previous_payment_status: "succeeded",
            next_payment_status: "succeeded",
            previous_settlement_status: "manual_review",
            next_settlement_status: "held",
            data: {
                resolvedReason: reason,
                paymentIntentId: body.p_payment_intent_id,
                chargeId: body.p_charge_id,
                balanceTransactionId: body.p_balance_transaction_id,
            },
        });
        return jsonResponse({ recovered: true, payment });
    }
    if (table === "rpc/record_marketplace_terms_acceptance" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const userId = String(body.p_cms_user_id);
        const version = String(body.p_terms_version);
        const hash = String(body.p_terms_hash);
        const account = mock.tables.accounts.find((row) => row.cms_user_id === userId);
        if (!account) {
            return jsonResponse({ message: "not_found: Stripe Connect account" }, 400);
        }
        let acceptance = mock.tables.marketplace_terms_acceptances.find(
            (row) => row.cms_user_id === userId && row.terms_version === version,
        );
        if (acceptance && acceptance.terms_hash !== hash) {
            return jsonResponse(
                { message: "conflict: marketplace terms version is already bound to another document hash" },
                400,
            );
        }
        if (!acceptance) {
            acceptance = {
                cms_user_id: userId,
                terms_version: version,
                terms_hash: hash,
                accepted_at: "2026-07-06T12:03:00.000Z",
            };
            mock.tables.marketplace_terms_acceptances.push(acceptance);
        }
        const previousAcceptedAt = Date.parse(String(account.marketplace_terms_accepted_at ?? ""));
        const acceptedAt = Date.parse(String(acceptance.accepted_at));
        if (!Number.isFinite(previousAcceptedAt) || acceptedAt >= previousAcceptedAt) {
            mock.update(account, {
                marketplace_terms_version: acceptance.terms_version,
                marketplace_terms_hash: acceptance.terms_hash,
                marketplace_terms_accepted_at: acceptance.accepted_at,
            });
        }
        if (mock.failAccountReloadAfterTermsAcceptance) {
            mock.failAccountReloadAfterTermsAcceptance = false;
            mock.omitNextAccountRead = true;
        }
        return jsonResponse(acceptance);
    }
    return null;
}
