import type { ConnectAccountRow } from "../db/records/accounts.ts";
import type { JsonRecord } from "../shared/types.ts";

export type StripeAccount = JsonRecord & {
    id: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    country?: string;
    business_type?: string | null;
    requirements?: JsonRecord;
    future_requirements?: JsonRecord;
    capabilities?: JsonRecord;
};

export type StripeAccountApiVersion = ConnectAccountRow["stripe_account_api_version"];

export type StripePaymentIntent = JsonRecord & {
    id: string;
    client_secret?: string;
    status?: string;
    latest_charge?: string | JsonRecord | null;
};

export type ProviderTruthActorKind = "system" | "webhook" | "reconciliation";

export type StripeTransfer = JsonRecord & { id: string; amount?: number; currency?: string; reversed?: boolean };
export type StripeRefund = JsonRecord & { id: string; amount?: number; currency?: string; status?: string };
export type StripeDispute = JsonRecord & {
    id: string;
    charge?: string | JsonRecord;
    amount?: number;
    currency?: string;
    status?: string;
};

export type StripeAccountSession = JsonRecord & {
    account: string;
    client_secret: string;
    expires_at?: number;
};

export type StripeBalance = JsonRecord & {
    available?: unknown;
    pending?: unknown;
    instant_available?: unknown;
    connect_reserved?: unknown;
    livemode?: boolean;
};

export type StripeBalanceSettings = JsonRecord & {
    payments?: JsonRecord;
};
