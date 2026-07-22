import { defaultAccountRow } from "../accounts";
import { DisputeFixtures } from "./disputes";

export class AccountFixtures extends DisputeFixtures {
    seedLegacyRecipientAccount(userId: string): void {
        const now = "2026-07-06T11:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}_legacy`,
            stripe_account_api_version: "v1",
        });
        this.stripeAccountState.set(userId, {
            payouts_enabled: false,
            details_submitted: false,
            tos_acceptance: { service_agreement: "recipient" },
        });
    }

    seedActiveLegacyAccount(userId: string): void {
        const now = "2026-07-06T11:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}_active_legacy`,
            stripe_account_api_version: "v1",
        });
        this.stripeAccountState.set(userId, {
            payouts_enabled: true,
            details_submitted: true,
            tos_acceptance: { service_agreement: "full" },
        });
    }

    seedPayoutScheduleAccount(userId: string, connected: boolean): void {
        const now = "2026-07-06T12:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: connected ? `acct_payout_schedule_${userId.replace(/[^a-z0-9]+/gi, "_")}` : null,
            stripe_account_api_version: "v2",
            application_controlled_recipient: true,
            terms_accepted: true,
            business_type: "individual",
            onboarding_status: "enabled",
            payouts_enabled: true,
            details_submitted: true,
            capabilities: {
                stripe_balance: {
                    stripe_transfers: { status: "active", status_details: [] },
                    payouts: { status: "active", status_details: [] },
                },
            },
        });
    }

    seedHostedV2AccountWithRequirements(userId: string): void {
        const now = "2026-07-06T11:00:00.000Z";
        this.tables.accounts.push({
            ...defaultAccountRow(userId, now),
            stripe_account_id: `acct_${userId.replace(/[^a-z0-9]+/gi, "_")}_hosted_v2`,
            stripe_account_api_version: "v2",
            onboarding_status: "requirements_due",
        });
        this.stripeAccountState.set(userId, {
            dashboard: "express",
            defaults: {
                currency: "eur",
                responsibilities: {
                    fees_collector: "application",
                    losses_collector: "application",
                    requirements_collector: "stripe",
                },
            },
            requirements: {
                entries: [
                    {
                        awaiting_action_from: "user",
                        description: "identity.individual.attestations.terms_of_service",
                        errors: [],
                        minimum_deadline: { status: "currently_due" },
                    },
                ],
                summary: { minimum_deadline: { status: "currently_due" } },
            },
        });
    }
}
