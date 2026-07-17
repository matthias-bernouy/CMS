import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const integrationRoot = resolve(import.meta.dir, "../../../../integrations/commerce/versions/1.0.0");

describe("protected C2C financial policy contract", () => {
    test("derives generic refund allocations and enforces distinct dual approvers", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRefund = functionSql(schema, "create_refund_request", "refund_authorization_payload");
        const requestRefund = functionSql(schema, "request_order_refund", "review_refund_request");
        const reviewRefund = functionSql(schema, "review_refund_request", "authorize_order_release");
        const authorizeRelease = functionSql(schema, "authorize_order_release", "authorize_order_reserve_release");
        const reviewCancellationAs = functionSql(schema, "review_order_cancellation_as", "review_order_cancellation");
        const reviewCancellation = functionSql(schema, "review_order_cancellation", "process_due_order_deadlines");
        const deadlineWorker = functionSql(schema, "process_due_order_deadlines", "authorize_due_order_releases");
        const resolveClaim = functionSql(schema, "resolve_marketplace_claim", "request_order_refund");
        const recoverShipment = functionSql(schema, "recover_order_shipment_creation", "fail_order_shipment_creation");

        expect(requestRefund).not.toContain("p_seller_recovery_amount");
        expect(requestRefund).not.toContain("p_protection_fee_refund_amount");
        expect(requestRefund).toContain("commerce.calculate_protection_fee_refund");
        expect(requestRefund).toContain("v_terms.seller_proceeds_amount - v_existing_seller_recovery");
        expect(schema).toContain("refund_requests_one_nonterminal_order_idx");
        expect(schema).toContain("v_cumulative_amount >= v_protection.finance_review_threshold_amount");
        expect(schema).toContain("v_cumulative_amount >= v_protection.dual_approval_threshold_amount");
        expect(createRefund).toContain("p_requested_by_kind is null");
        expect(createRefund).toContain("p_requested_by_kind not in ('buyer', 'seller', 'admin', 'system')");
        expect(createRefund).toContain("p_requested_by_kind = 'admin'");
        expect(requestRefund).toContain("if p_actor_kind is distinct from 'admin'");
        expect(resolveClaim).toContain("if p_actor_kind is distinct from 'admin'");
        expect(recoverShipment).toContain("p_actor_kind is distinct from 'admin'");
        expect(authorizeRelease).toContain("p_actor_kind is null or p_actor_kind not in ('admin', 'system')");
        expect(reviewCancellationAs).toContain("'order_cancellation', p_actor_kind, p_actor_id");
        expect(reviewCancellation).toContain("p_request_id, p_decision, 'admin', p_actor_id, p_reason");
        expect(deadlineWorker).toContain("v_candidate.id, 'approved', 'system', 'deadline-worker:'");
        expect(schema).toContain("actor_kind in ('buyer', 'seller', 'support', 'finance', 'admin', 'system')");
        expect(schema).toContain("requested_by_kind in ('buyer', 'seller', 'support', 'finance', 'admin', 'system')");
        expect(schema).toContain("actor_kind in ('buyer', 'seller', 'support', 'finance', 'admin', 'system', 'provider')");
        expect(schema).toContain("authorized_by_kind in ('finance', 'admin', 'system')");
        expect(reviewRefund).toContain("dual approval requires a second admin actor");
        expect(reviewRefund).toContain("'admin', p_actor_id");
        expect(reviewRefund).toContain("first_approved_by = p_actor_id");
        expect(reviewRefund).toContain("second_approved_by");
    });

    test("publishes aggregate payout controls as required payment and release inputs", async () => {
        const definition = JSON.parse(await readFile(resolve(integrationRoot, "definition.json"), "utf8"));
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source");
        const endpoint = source.source.endpoints.find((candidate: any) => candidate.endpointId === "prepareProtectedPayment");
        const body = endpoint.output[0].body;

        expect(endpoint.access).toBe("system");
        expect(body.required).toEqual(expect.arrayContaining([
            "payoutDelayDays",
            "sellerReserveLiabilityDays",
            "sellerRequiredMinimumBalanceAmount",
            "platformRequiredMinimumBalanceAmount",
            "platformLiabilityRevision",
            "platformPayoutChangeDirection",
        ]));
        expect(body.properties).toMatchObject({
            payoutDelayDays: { type: "number" },
            sellerReserveLiabilityDays: { type: "number" },
            sellerRequiredMinimumBalanceAmount: { type: "number" },
            platformRequiredMinimumBalanceAmount: { type: "number" },
            platformLiabilityRevision: { type: "number" },
            platformPayoutChangeDirection: { type: "string" },
        });
        const releaseBody = source.source.endpoints.find(
            (candidate: any) => candidate.endpointId === "authorizeOrderRelease",
        ).output[0].body;
        const dueReleaseItem = source.source.endpoints.find(
            (candidate: any) => candidate.endpointId === "authorizeDueOrderReleases",
        ).output[0].body.properties.authorizations.items;
        for (const releaseShape of [releaseBody, dueReleaseItem]) {
            expect(releaseShape.required).toEqual(expect.arrayContaining([
                "sellerId",
                "sellerRequiredMinimumBalanceAmount",
                "payoutDelayDays",
            ]));
            expect(releaseShape.properties).toMatchObject({
                sellerId: {
                    type: "string",
                    semantic: { kind: "user-id", authority: "cms" },
                },
                sellerRequiredMinimumBalanceAmount: { type: "number" },
                payoutDelayDays: { type: "number" },
            });
        }
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        expect(schema).toContain("authorize_platform_payout_liability_decrease");
        expect(schema).toContain("conflict: stale platform payout liability revision");
        expect(schema).toContain("provider applied amount is below the Commerce aggregate");
        expect(schema).toContain("Admin-authorized provider decrease must match the exact Commerce aggregate");
        expect(schema).toContain("liability.risk_release_at > now()");
        expect(schema).toContain("status not in ('won', 'prevented', 'warning_closed')");
    });

    test("keeps a non-zero seller reserve as a later releasable liability", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");

        expect(schema).toContain("'eur', 1000,\n    14, 120");
        expect(schema).toContain("v_order.id, v_terms.seller_proceeds_amount");
        expect(schema).toContain("release_kind in ('initial', 'reserve')");
        expect(schema).toContain("authorize_order_reserve_release");
        expect(schema).toContain("risk.reserve_liability_days");
        expect(schema).toContain("seller_reserve_liability_remaining_amount <= authorized_seller_amount");
    });

    test("resolves later claims from the current locked seller entitlement", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const resolver = functionSql(schema, "resolve_marketplace_claim", "request_order_refund");

        expect(resolver).toContain("p_seller_transfer_amount > v_settlement.authorized_seller_amount");
        expect(resolver).toContain("v_settlement.authorized_seller_amount - p_seller_transfer_amount");
        expect(resolver).not.toContain("v_terms.seller_proceeds_amount - p_seller_transfer_amount");
    });

    test("bounds platform-funded claim refunds and only terminalizes confirmed provider outcomes", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRefund = functionSql(schema, "create_refund_request", "refund_authorization_payload");
        const resolver = functionSql(schema, "resolve_marketplace_claim", "request_order_refund");
        const projection = functionSql(
            schema,
            "record_order_settlement_projection",
            "record_order_stripe_dispute_projection",
        );

        for (const financialBoundary of [createRefund, resolver]) {
            expect(financialBoundary).toContain(
                "v_terms.platform_retained_amount - v_terms.buyer_protection_fee_amount",
            );
            expect(financialBoundary).toContain(
                "requested_amount - protection_fee_refund_amount - seller_recovery_amount",
            );
            expect(financialBoundary).toContain("status not in ('rejected', 'cancelled', 'failed')");
        }
        expect(resolver).toContain(
            "p_buyer_refund_amount\n            - v_seller_recovery - p_protection_fee_refund_amount",
        );
        expect(resolver).toContain("claim refund exceeds immutable platform contribution");
        expect(resolver).toContain("'platformContributionAmount', coalesce(v_platform_contribution, 0)");
        expect(projection).toContain(
            "when total_refunded_amount + p_amount = v_terms.buyer_total_amount then 'refunded'",
        );
        expect(projection).toContain("else 'held' end");
        expect(projection).not.toContain("when authorized_seller_amount > 0 then 'held'");
        expect(projection).toContain("if v_refund.claim_id is not null then");
        expect(projection).toContain("update commerce.orders set status = 'completed'");
        expect(projection).toContain("claim.status in ('resolved_buyer', 'resolved_split')");
        const claimBranchStart = projection.indexOf("if v_refund.claim_id is not null then");
        const cancellationBranchStart = projection.indexOf("\n            else", claimBranchStart);
        expect(claimBranchStart).toBeGreaterThanOrEqual(0);
        expect(cancellationBranchStart).toBeGreaterThan(claimBranchStart);
        expect(projection.slice(claimBranchStart, cancellationBranchStart)).not.toContain(
            "restore_order_inventory",
        );
    });

    test("fails closed without an explicitly audited fee policy", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");

        expect(schema).toContain("'c2c-default', 2, 'Protected C2C configuration required', 'draft'");
        expect(schema).not.toContain("Pre-release zero-fee subsidy");
        expect(schema).not.toContain("id, 9007199254740991");
        expect(schema).toContain("an audited subsidy amount and reason are required");
    });

    test("applies seller velocity, value, claim, chargeback, and debt gates", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const riskGate = functionSql(schema, "assert_order_seller_risk", "lock_order_financial_terms");

        expect(riskGate).toContain("outstanding_debt_amount");
        expect(riskGate).toContain("high_value_review_amount");
        expect(riskGate).toContain("velocity_limit_amount");
        expect(riskGate).toContain("claim_ratio_review_bps");
        expect(riskGate).toContain("chargeback_ratio_review_bps");
        expect(riskGate).toContain("pg_advisory_xact_lock");
        expect(riskGate).toContain("'commerce-seller-risk:'");
        expect(riskGate).toContain("prior_order.status = 'awaiting_payment'");
        expect(riskGate).toContain("attempt.status in ('created', 'requires_action', 'processing')");
        const lockTerms = functionSql(schema, "lock_order_financial_terms", "prepare_protected_payment");
        expect(lockTerms).toContain("from commerce.sellers where id = v_order.seller_id for update");
        expect(lockTerms).toContain("pg_advisory_xact_lock");
        expect(schema).toContain("perform commerce.assert_order_seller_risk(v_order.id, 'payment preparation')");
        expect(schema).toContain("perform commerce.assert_order_seller_risk(v_order.id, 'settlement release')");
    });

    test("persists unrecovered seller debt without clearing independent review on dispute win", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const dispute = functionSql(schema, "record_order_stripe_dispute_projection", "request_order_cancellation");

        expect(schema).toContain("commerce.seller_financial_exposures");
        expect(schema).toContain("'reversal_failure', 'debt'");
        expect(dispute).toContain("'chargeback:' || p_provider_dispute_id");
        expect(dispute).toContain("and status <> 'manual_review'");
        expect(dispute).toContain("manual_review_reason like 'stripe_dispute_%'");
    });

    test("rejects duplicate provider event ids whose canonical payload changed", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const replayGuard = functionSql(schema, "claim_provider_projection_event", "create_c2c_policy_revision");

        expect(replayGuard).toContain("v_existing.payload is distinct from");
        expect(replayGuard).toContain("provider event replay changed canonical payload");
        expect(schema.match(/claim_provider_projection_event\(/g)).toHaveLength(6);
    });

    test("returns the original result for an exact cancellation replay", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const cancellation = functionSql(
            schema,
            "request_order_cancellation",
            "review_order_cancellation",
        );

        expect(cancellation).toContain("requested_by_kind = p_actor_kind");
        expect(cancellation).toContain("requested_by = p_actor_id");
        expect(cancellation).toContain("reason = p_reason");
        expect(cancellation).toContain("status <> 'rejected'");
        expect(cancellation).toContain("payment_cancellation_authorization_payload(cancellation.id)");
        expect(cancellation.indexOf("requested_by_kind = p_actor_kind")).toBeLessThan(
            cancellation.indexOf("order cannot be cancelled"),
        );
    });

    test("recovers only the exact revalidated provider-payment ambiguity and otherwise stays fail-closed", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const projection = functionSql(
            schema,
            "record_order_payment_projection",
            "record_order_fulfillment_projection",
        );
        const manualQualification = projection.slice(
            projection.indexOf("v_provider_review_recoverable :="),
            projection.indexOf("v_event_id :="),
        );
        const successBranch = projection.slice(
            projection.indexOf("elsif p_status = 'succeeded' then"),
            projection.indexOf("elsif p_status = 'manual_review' then"),
        );
        const manualReviewBranch = projection.slice(projection.indexOf("elsif p_status = 'manual_review' then"));

        expect(successBranch).toContain("from commerce.order_settlements");
        expect(successBranch).toContain("from commerce.order_fulfillments");
        expect(successBranch).toContain("for update");
        expect(successBranch).toContain("v_settlement.status = 'manual_review'");
        expect(successBranch).toContain("v_settlement.manual_review_reason in (");
        expect(successBranch).toContain("'provider_payment_manual_review_nonrecoverable'");
        expect(projection).toContain(
            "'Stripe payment provider truth mismatch: charge_balance_transaction_expansion'",
        );
        expect(manualQualification).toContain("p_status = 'manual_review'");
        expect(manualQualification).toContain("v_provider_review_reason = v_transient_provider_review_reason");
        expect(manualQualification).toContain("p_provider_snapshot->>'paymentStatus' in ('failed', 'succeeded')");
        expect(manualQualification).toContain("'commercePaymentStatus', 'manual_review'");
        expect(manualQualification).toContain("'settlementStatus', 'manual_review'");
        expect(manualQualification).toContain("'sellerTransferAmount', v_terms.seller_proceeds_amount");
        expect(manualQualification).toContain("'platformRetainedAmount', v_terms.platform_retained_amount");
        expect(manualQualification).toContain("p_provider_snapshot->>'clientReferenceId' = v_order.public_id::text");
        expect(manualQualification).toContain("'amountTotal', v_terms.buyer_total_amount");
        expect(manualQualification).toContain("lower(p_provider_snapshot->>'currency') = v_terms.currency");
        expect(manualQualification).toContain("p_provider_snapshot->>'financialTermsHash' = v_terms.financial_terms_hash");
        expect(manualQualification).toContain("p_provider_payment_intent_id is not null");
        expect(manualQualification).toContain("p_provider_charge_id is not null");
        expect(manualQualification).toContain("p_provider_snapshot->>'stripePaymentIntentId' = p_provider_payment_intent_id");
        expect(manualQualification).toContain("p_provider_snapshot->>'stripeChargeId' = p_provider_charge_id");
        expect(manualQualification).toContain("p_provider_snapshot->>'stripeChargeBalanceTransactionId'");
        expect(manualQualification).toContain("p_occurred_at = v_snapshot_updated_at");
        expect(projection).toContain("p_provider_snapshot->>'updatedAt'");
        expect(projection).toContain("v_snapshot_updated_at :=");
        expect(manualQualification).toContain("v_settlement.status = 'held'");
        expect(manualQualification).toContain("v_settlement.manual_review_reason is null");
        expect(manualQualification).toContain("v_fulfillment.status in (");
        expect(manualQualification).toContain("v_fulfillment.blocking_reason is null");
        expect(manualQualification).toContain("v_fulfillment.claim_window_started_at is null");
        expect(manualQualification).not.toContain("'collected_by_recipient'");
        expect(projection).toContain("p_status not in ('succeeded', 'manual_review')");
        expect(successBranch).toContain("'paymentStatus', 'succeeded'");
        expect(successBranch).toContain("'commercePaymentStatus', 'succeeded'");
        expect(successBranch).toContain("'settlementStatus', 'held'");
        expect(successBranch).toContain("'disputeStatus', 'none'");
        expect(successBranch).toContain("'sellerTransferAmount', v_terms.seller_proceeds_amount");
        expect(successBranch).toContain("'platformRetainedAmount', v_terms.platform_retained_amount");
        expect(successBranch).toContain("'refundedAmount', 0");
        expect(successBranch).toContain("'transferredAmount', 0");
        expect(successBranch).toContain("'reversedAmount', 0");
        expect(successBranch).toContain("p_provider_snapshot->>'clientReferenceId' = v_order.public_id::text");
        expect(successBranch).toContain("'amountTotal', v_terms.buyer_total_amount");
        expect(successBranch).toContain("lower(p_provider_snapshot->>'currency') = v_terms.currency");
        expect(successBranch).toContain("p_provider_snapshot->>'financialTermsHash' = v_terms.financial_terms_hash");
        expect(successBranch).toContain("p_occurred_at = v_snapshot_updated_at");
        expect(successBranch).toContain("p_provider_snapshot->'manualReviewReason' = 'null'::jsonb");
        expect(successBranch).toContain("p_provider_payment_intent_id is not null");
        expect(successBranch).toContain("p_provider_charge_id is not null");
        expect(successBranch).toContain("p_provider_snapshot->>'stripePaymentIntentId' = p_provider_payment_intent_id");
        expect(successBranch).toContain("p_provider_snapshot->>'stripeChargeId' = p_provider_charge_id");
        expect(successBranch).toContain("p_provider_snapshot->>'stripeChargeBalanceTransactionId'");
        expect(successBranch).toContain("like 'txn_%'");
        expect(successBranch).not.toContain("p_provider_payment_intent_id is null\n                or");
        expect(successBranch).not.toContain("p_provider_charge_id is null\n                or");
        expect(successBranch).toContain("financial_exception.reason = 'Ambiguous provider payment state'");
        expect(successBranch).toContain("'Provider payment requires non-automatic manual review'");
        expect(successBranch).toContain("financial_exception.details->>'recoverable' = 'false'");
        expect(successBranch).toContain("financial_exception.details->>'providerPaymentId' = p_provider_payment_id::text");
        expect(successBranch).toContain("financial_exception.details->>'providerManualReviewReason'");
        expect(successBranch).toContain("financial_exception.details->>'recoverable' = 'true'");
        expect(successBranch).toContain("financial_exception.details->>'providerOccurredAt'");
        expect(successBranch).toContain("v_review_occurred_at :=");
        expect(successBranch).toContain("p_occurred_at > v_review_occurred_at");
        expect(successBranch).toContain("financial_exception.status in ('open', 'investigating')");
        expect(successBranch).toContain("and not exists (\n                select 1\n                from commerce.financial_exceptions");
        expect(successBranch).toContain("from commerce.provider_projection_events provider_event");
        expect(successBranch).toContain("provider_event.event_type like 'payment.%'");
        expect(successBranch).toContain("provider_event.provider_event_id <> p_provider_event_id");
        expect(successBranch).toContain("provider_event.occurred_at >= p_occurred_at");
        for (const blocker of [
            "commerce.marketplace_claims",
            "commerce.stripe_dispute_projections",
            "commerce.refund_requests",
            "commerce.order_cancellation_requests",
            "commerce.payment_cancellation_requests",
            "commerce.settlement_release_authorizations",
            "commerce.financial_operation_dispatch_claims",
            "commerce.seller_financial_exposures",
        ]) {
            expect(successBranch).toContain(blocker);
        }
        expect(successBranch).toContain("v_settlement.total_transferred_amount = 0");
        expect(successBranch).toContain("v_settlement.total_reversed_amount = 0");
        expect(successBranch).toContain("v_settlement.total_refunded_amount = 0");
        expect(successBranch).toContain("v_settlement.provider_transfer_id is null");
        expect(successBranch).toContain("status = 'held', manual_review_reason = null");
        expect(successBranch).toContain("resolved_by = 'stripe-provider-truth-revalidation'");
        expect(successBranch).toContain("'ambiguous_payment_state_revalidated'");
        expect(successBranch).toContain("'commerce.order.payment_review_recovered'");
        expect(successBranch).toContain("v_recovered_ambiguous_payment := true");
        expect(successBranch).toContain("if (v_settlement.status = 'held' or v_recovered_ambiguous_payment)");
        expect(successBranch).toContain("and (v_payment_review_transition_safe or v_recovered_ambiguous_payment)");
        expect(successBranch).toContain("and v_settlement.manual_review_reason is null");
        expect(successBranch).toContain("and v_fulfillment.blocking_reason is null");
        expect(successBranch).toContain("and v_fulfillment.release_eligible_at is null");
        expect(projection).toContain("'paymentReviewRecovered', v_recovered_ambiguous_payment");
        expect(manualReviewBranch).toContain("'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id");
        expect(manualReviewBranch).toContain("'provider-payment-review:' || v_order.id || ':' || p_provider_payment_id");
        expect(manualReviewBranch).toContain("'provider_payment_manual_review_nonrecoverable'");
        expect(manualReviewBranch).toContain("if v_payment_review_transition_safe then");
        expect(manualReviewBranch).toContain("and status = 'held'");
        expect(manualReviewBranch).toContain("and manual_review_reason is null");
        expect(manualReviewBranch).toContain("'providerManualReviewReason', v_provider_review_reason");
        expect(manualReviewBranch).toContain("'providerEventId', p_provider_event_id");
        expect(manualReviewBranch).toContain("'providerOccurredAt', p_occurred_at");
        expect(manualReviewBranch).toContain("'recoverable', v_provider_review_recoverable");
        expect(manualReviewBranch).toContain("insert into commerce.financial_exceptions as financial_exception");
        expect(manualReviewBranch).toContain("on conflict (deduplication_key)");
        expect(manualReviewBranch).toContain("status = 'open'");
        expect(manualReviewBranch).toContain("resolved_at = null, resolved_by = null");
        expect(manualReviewBranch).toContain("financial_exception.details->>'providerOccurredAt'");
        expect(manualReviewBranch).toContain("excluded.details->>'providerOccurredAt'");
        expect(manualReviewBranch).toContain("else 'infinity'::timestamptz");
        expect(manualReviewBranch).toContain("else '-infinity'::timestamptz");
    });

    test("declares computed actor and role headers on every financial admin endpoint", async () => {
        const definition = JSON.parse(await readFile(resolve(integrationRoot, "definition.json"), "utf8"));
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source");
        const financialIds = new Set([
            "c2cPolicies", "createC2cPolicyRevision", "protectedPayments", "protectedPayment",
            "claims", "claim", "resolveOrderClaim", "refundRequests", "refundRequest",
            "requestOrderRefund", "reviewOrderRefund", "authorizeOrderRelease",
            "reviewOrderCancellation", "listCommerceExceptions",
        ]);
        const financialEndpoints = source.source.endpoints.filter((item: any) => financialIds.has(item.endpointId));
        expect(financialEndpoints).toHaveLength(financialIds.size);
        for (const endpoint of financialEndpoints) {
            expect(endpoint.access).toEqual({ mode: "admin" });
            expect(endpoint.headers).toEqual(expect.arrayContaining([
                { name: "x-cms-user-id", source: { from: "computed", ref: "userID" } },
                { name: "x-cms-user-role", source: { from: "computed", ref: "userRole" } },
            ]));
        }
    });

    test("publishes protected C2C revisions from the admin settings dashboard with CAS and typed controls", async () => {
        const definition = JSON.parse(await readFile(resolve(integrationRoot, "definition.json"), "utf8"));
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source").source;
        const dashboard = definition.artifacts.find((artifact: any) =>
            artifact.dashboard?.id === "{{answers.id}}-configuration"
        ).dashboard;
        const detail = dashboard.views.find((view: any) => view.id === "protectedC2cPolicySettings");
        const action = detail.actions.find((candidate: any) => candidate.id === "publishProtectedC2cPolicyRevision");
        const endpoint = source.endpoints.find((candidate: any) => candidate.endpointId === "createC2cPolicyRevision");
        const fields = detail.main.flatMap((section: any) => section.fields);
        const fieldById = Object.fromEntries(fields.map((field: any) => [field.id, field]));

        expect(detail.source).toEqual({ endpoint: "c2cPolicies" });
        expect(detail.title.path).toBe("activePolicy.name");
        expect(action).toMatchObject({
            label: "Publish new protected C2C policy revision",
            confirm: expect.stringContaining("new protected C2C financial policy revision"),
            endpoint: {
                endpoint: "createC2cPolicyRevision",
                body: { expectedSettingsVersion: "$resource.settings.version" },
            },
        });
        expect(Object.keys(action.endpoint.body).sort()).toEqual(endpoint.body.required.concat([
            "buyerFeeMinimumAmount", "buyerFeeMaximumAmount", "sellerFeeMinimumAmount",
            "sellerFeeMaximumAmount", "subsidyReason", "subsidyMaximumDeficitAmount",
        ]).sort());
        expect(JSON.stringify(action.endpoint.body)).not.toMatch(/PolicyId|activeC2c/i);
        expect(fieldById.costEstimatesConfigured).toMatchObject({ type: "checkbox" });
        expect(fieldById.subsidyOverride).toMatchObject({ type: "checkbox" });
        for (const id of [
            "buyerFeeRateBps", "sellerFeeRateBps", "sellerReserveRateBps",
            "claimRatioReviewBps", "chargebackRatioReviewBps",
        ]) {
            expect(fieldById[id]).toMatchObject({ type: "number", min: 0, step: 1 });
        }
        expect(fieldById.buyerFeeBasis.options.map((item: any) => item.value)).toEqual([
            "merchandise", "merchandise_and_shipping",
        ]);
        expect(fieldById.buyerFeeRefundPolicy.options.map((item: any) => item.value)).toEqual([
            "always", "never", "proportional", "resolution_defined",
        ]);
        expect(fieldById.sellerFeeRefundPolicy.options.map((item: any) => item.value)).toEqual(["never"]);
    });

    test("serializes protected C2C publication and rejects stale settings versions", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRevision = functionSql(schema, "create_c2c_policy_revision", "refresh_seller_risk_state");
        const route = await readFile(resolve(
            integrationRoot,
            "connectors/supabase/functions/cms-commerce/routes/configuration/protected-policies.ts",
        ), "utf8");

        expect(createRevision).toContain("pg_advisory_xact_lock(hashtextextended('commerce-c2c-policy', 0))");
        expect(createRevision).toContain("from commerce.settings where id = 'default' for update");
        expect(createRevision).toContain("v_settings.version is distinct from p_expected_settings_version");
        expect(createRevision).toContain("conflict: stale settings version");
        expect(createRevision).toContain("select max(version) from commerce.fee_policies");
        expect(route).toContain("is not allowed in a protected C2C policy revision");
        expect(route).toContain("assertAllowedValue(payload.shippingBeneficiary");
        expect(route).toContain("sellerReserveRateBps: [0, 9_999]");
    });

    test("refuses an economically uncovered policy unless an audited subsidy covers its deficit", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const createRevision = functionSql(schema, "create_c2c_policy_revision", "refresh_seller_risk_state");

        expect(createRevision).toContain("v_guaranteed_fee_floor");
        expect(createRevision).toContain("v_required_revenue_floor");
        expect(createRevision).toContain("fee fixed amount cannot exceed its maximum amount");
        expect(createRevision).toContain("buyerFeeMaximumAmount");
        expect(createRevision).toContain("sellerFeeMaximumAmount");
        expect(createRevision).toContain("guaranteed fee floor does not cover configured costs and minimum margin");
        expect(createRevision).toContain("audited subsidy maximum does not cover the configured policy deficit");
        expect(createRevision).toContain("insert into commerce.financial_subsidy_overrides");
    });

    test("finalizes provider-absent cancellation without creating a fake payment liability", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const absent = functionSql(schema, "record_absent_order_payment_cancellation", "record_order_payment_projection");
        const prepare = functionSql(schema, "prepare_protected_payment", "ensure_payment_cancellation_request");
        const aggregate = functionSql(
            schema,
            "refresh_platform_payout_liability",
            "authorize_platform_payout_liability_decrease",
        );

        expect(absent).toContain("absent provider truth cannot finalize an order with a payment attempt");
        expect(absent).toContain("payment_cancellation_provider_absent");
        expect(absent).toContain("perform commerce.restore_order_inventory(v_order.id)");
        expect(absent).not.toContain("insert into commerce.order_payment_attempts");
        expect(prepare).toContain("v_order.id, 'provisional', null");
        expect(absent).toContain("v_order.id, 'released', null");
        expect(absent).toContain("Provider-absent payment cancellation released prospective liability");
        expect(aggregate).toContain("terms.platform_risk_reserve_contribution_amount");
    });

    test("keeps claim evidence private and requires carrier proof before resolving a required return", async () => {
        const schema = await Bun.file(new URL("../../../../integrations/commerce/versions/1.0.0/connectors/supabase/schema.sql", import.meta.url)).text();
        const definition = await Bun.file(new URL("../../../../integrations/commerce/versions/1.0.0/definition.json", import.meta.url)).json() as Record<string, unknown>;
        const serialized = JSON.stringify(definition);

        expect(schema).toContain("'commerce-claim-evidence', 'commerce-claim-evidence', false");
        expect(schema).toContain("attach_marketplace_claim_evidence");
        expect(schema).toContain("required return needs trusted recipient handoff before monetary resolution");
        expect(schema).toContain("record_claim_return_delivery");
        expect(serialized).toContain("uploadMyOrderClaimEvidence");
        expect(serialized).toContain("uploadMySaleClaimEvidence");
        expect(serialized).toContain("claimEvidenceFile");
        expect(serialized).toContain("recordClaimReturnDelivery");
        const sourceArtifact = (definition.artifacts as Array<Record<string, unknown>>)
            .find(artifact => artifact.type === "source") as { source?: { endpoints?: Array<Record<string, unknown>> } } | undefined;
        const claimEndpoint = sourceArtifact?.source?.endpoints?.find(endpoint => endpoint.endpointId === "claim");
        expect(JSON.stringify(claimEndpoint)).not.toContain("storagePath");
        const evidenceEndpoints = sourceArtifact?.source?.endpoints?.filter(endpoint =>
            String(endpoint.endpointId ?? "").toLowerCase().includes("claimevidence")
        );
        expect(JSON.stringify(evidenceEndpoints)).not.toContain("storagePath");
    });

    test("keeps a retryable shipment creation eligible for the atomic reservation guard", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const authorization = functionSql(
            schema,
            "get_order_fulfillment_authorization",
            "get_order_label_authorization",
        );
        const reservation = functionSql(
            schema,
            "reserve_order_shipment_creation",
            "claim_pending_shipment_creations",
        );

        for (const boundary of [authorization, reservation]) {
            expect(boundary).toContain(
                "('awaiting_shipment', 'shipment_creating', 'label_created')",
            );
        }
        expect(reservation).toContain("v_operation.status in ('failed', 'requested')");
        expect(reservation).toContain("v_operation.claimed_at < now() - interval '5 minutes'");
        expect(reservation).toContain("v_operation.status in ('unknown', 'manual_review', 'cancelled')");
    });

    test("keeps seller label access after handoff declaration but closes it on carrier acceptance", async () => {
        const schema = await readFile(resolve(integrationRoot, "connectors/supabase/schema.sql"), "utf8");
        const labelAuthorization = functionSql(
            schema,
            "get_order_label_authorization",
            "record_delivery_reconciliation_health",
        );

        expect(labelAuthorization).toContain(
            "fulfillment.status in ('label_created', 'seller_handoff_declared')",
        );
        expect(labelAuthorization).not.toContain("'carrier_accepted'");
    });

});

function functionSql(schema: string, start: string, end: string): string {
    return schema.slice(
        schema.indexOf(`create or replace function commerce.${start}(`),
        schema.indexOf(`create or replace function commerce.${end}(`),
    );
}
