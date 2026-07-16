export type JsonRecord = Record<string, unknown>;

export class HttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

export type CampaignRow = {
    id: string;
    status: string;
    template_key: string;
    shared_data: JsonRecord;
    rate_per_minute: number;
    scheduled_at?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    total_count: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    created_at?: string;
    updated_at?: string;
};

export type RecipientRow = {
    id: string;
    campaign_id: string;
    email: string;
    data: JsonRecord;
    status: string;
    attempts: number;
    next_attempt_at: string;
    last_error?: string | null;
    message_id?: string | null;
};
