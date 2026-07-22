import { expect, test } from "bun:test";
import { functionsBaseUrl } from "../../runtime/constants";
import { activeEnv } from "../../runtime/environment";
import type { StripeConnectHarness } from "../../runtime/harness";
import { jsonBody } from "../../runtime/http";
import { sourceJsonWithRole, sourceRequestWithRole } from "../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerDisputeApprovalSourceScenarios(createHarness: CreateHarness): void {
    test("keeps Stripe dispute submission and acceptance locally irreversible", async () => {
        const harness = await createHarness();
        harness.rest.seedDispute("dp_stage", "needs_response", "not_started", false);
        harness.rest.seedDispute("dp_submitted", "needs_response", "submitted", true);
        harness.rest.seedDispute("dp_terminal", "won", "closed", false);

        const missingRole = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/exceptions`, {
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
                    "x-cms-user-id": "operator",
                },
            }),
        );
        const adminList = await sourceRequestWithRole(harness, "admin-1", "admin", "listProviderExceptions");
        const supportList = await sourceRequestWithRole(harness, "operator", "support", "listProviderExceptions");
        const financeList = await sourceRequestWithRole(harness, "operator", "finance", "listProviderExceptions");
        const stagedByAdmin = await sourceJsonWithRole(harness, "admin-1", "admin", "stageStripeDisputeEvidence", {
            disputeId: "dp_stage",
            evidenceOperationId: "admin-stage-1",
            evidenceText: "Tracked shipment evidence",
        });
        const stagedBySupport = await sourceJsonWithRole(
            harness,
            "support-1",
            "support",
            "stageStripeDisputeEvidence",
            {
                disputeId: "dp_stage",
                evidenceOperationId: "support-stage-1",
                evidenceText: "Tracked shipment evidence",
            },
        );
        const supportSubmission = await sourceJsonWithRole(
            harness,
            "support-1",
            "support",
            "submitStripeDisputeEvidence",
            {
                disputeId: "dp_submitted",
                submissionOperationId: "support-submit",
                evidenceOperationId: "evidence-dp_submitted",
                confirmation: "SUBMIT STRIPE EVIDENCE",
            },
        );
        const resubmission = await sourceJsonWithRole(harness, "admin-1", "admin", "submitStripeDisputeEvidence", {
            disputeId: "dp_submitted",
            submissionOperationId: "submit-again",
            evidenceOperationId: "evidence-dp_submitted",
            confirmation: "SUBMIT STRIPE EVIDENCE",
        });
        const adminAcceptance = await sourceJsonWithRole(harness, "admin-1", "admin", "acceptStripeDispute", {
            disputeId: "dp_terminal",
            acceptanceOperationId: "admin-accept-terminal",
            confirmation: "ACCEPT STRIPE DISPUTE",
        });
        const financeAcceptance = await sourceJsonWithRole(harness, "finance-1", "finance", "acceptStripeDispute", {
            disputeId: "dp_terminal",
            acceptanceOperationId: "accept-terminal",
            confirmation: "ACCEPT STRIPE DISPUTE",
        });

        expect(missingRole.status).toBe(403);
        expect(adminList.status).toBe(200);
        expect(supportList.status).toBe(403);
        expect(financeList.status).toBe(403);
        expect(stagedByAdmin.status).toBe(200);
        expect(stagedBySupport.status).toBe(403);
        expect(supportSubmission.status).toBe(403);
        expect(resubmission.status).toBe(409);
        expect(await jsonBody(resubmission)).toEqual({
            error: "Stripe dispute evidence was already submitted irreversibly",
        });
        expect(adminAcceptance.status).toBe(409);
        expect(await jsonBody(adminAcceptance)).toEqual({ error: "Stripe dispute is already terminal" });
        expect(financeAcceptance.status).toBe(403);
        expect(harness.rest.rows("financial_operations")).toHaveLength(0);
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                event_type: "stripe_dispute_evidence_staged",
                actor_kind: "admin",
                actor_id: "admin-1",
            }),
        );
    });

    test("requires two distinct admins above the immutable Commerce threshold", async () => {
        const harness = await createHarness();
        harness.rest.seedDispute("dp_dual_submit", "needs_response", "staged", false);
        harness.rest.seedDispute("dp_dual_accept", "needs_response", "not_started", false);

        const submitBody = {
            disputeId: "dp_dual_submit",
            submissionOperationId: "submit-dual-1",
            evidenceOperationId: "evidence-dp_dual_submit",
            confirmation: "SUBMIT STRIPE EVIDENCE",
        };
        const firstSubmit = await sourceJsonWithRole(
            harness,
            "admin-1",
            "admin",
            "submitStripeDisputeEvidence",
            submitBody,
        );
        const repeatedFirstSubmit = await sourceJsonWithRole(
            harness,
            "admin-1",
            "admin",
            "submitStripeDisputeEvidence",
            submitBody,
        );
        const secondSubmit = await sourceJsonWithRole(
            harness,
            "admin-2",
            "admin",
            "submitStripeDisputeEvidence",
            submitBody,
        );

        const acceptBody = {
            disputeId: "dp_dual_accept",
            acceptanceOperationId: "accept-dual-1",
            confirmation: "ACCEPT STRIPE DISPUTE",
        };
        const firstAccept = await sourceJsonWithRole(harness, "admin-3", "admin", "acceptStripeDispute", acceptBody);
        const secondAccept = await sourceJsonWithRole(harness, "admin-4", "admin", "acceptStripeDispute", acceptBody);

        expect(firstSubmit.status).toBe(202);
        expect(repeatedFirstSubmit.status).toBe(202);
        expect(await jsonBody(firstSubmit)).toMatchObject({
            approvalStatus: "pending_second_approval",
            firstApprovedBy: "admin-1",
        });
        expect(secondSubmit.status).toBe(200);
        expect(await jsonBody(secondSubmit)).toMatchObject({ evidenceStatus: "submitted", approvalStatus: "approved" });
        expect(firstAccept.status).toBe(202);
        expect(secondAccept.status).toBe(200);
        expect(await jsonBody(secondAccept)).toMatchObject({ evidenceStatus: "accepted", approvalStatus: "approved" });
        expect(harness.rest.rows("irreversible_dispute_action_approvals")).toEqual([
            expect.objectContaining({
                first_actor_kind: "admin",
                first_actor_id: "admin-1",
                second_actor_kind: "admin",
                second_actor_id: "admin-2",
                status: "approved",
            }),
            expect.objectContaining({
                first_actor_kind: "admin",
                first_actor_id: "admin-3",
                second_actor_kind: "admin",
                second_actor_id: "admin-4",
                status: "approved",
            }),
        ]);
        expect(harness.rest.rows("payment_events")).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event_type: "stripe_dispute_evidence_submitted",
                    actor_kind: "admin",
                    actor_id: "admin-2",
                }),
                expect.objectContaining({
                    event_type: "stripe_dispute_accepted",
                    actor_kind: "admin",
                    actor_id: "admin-4",
                }),
            ]),
        );
    });
}
