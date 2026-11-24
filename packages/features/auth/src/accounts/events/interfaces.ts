export type AccountEventType = "account.created" | "account.email-verified";
export type EmailVerificationEvidence = {
    readonly accountRef?: string;
    readonly method: "email-link" | "password-reset";
    readonly accountCreatedAt: string;
};
export interface AccountEventRecording {
    enabled(type: AccountEventType): boolean;
}
export interface AccountEventIntent {
    readonly occurrenceId: string;
    readonly type: AccountEventType;
    readonly accountId: string;
    readonly accountRef: string;
    readonly accountCreatedAt: string;
    readonly occurredAt: string;
    readonly payloadJson: string;
    readonly causation: readonly string[];
    readonly state: "pending" | "sending" | "expired";
    readonly attempts: number;
    readonly token: string | null;
    readonly dueAt: string | null;
    readonly errorCode: string | null;
}
export interface AccountEventRecord {
    readonly source: "member" | "credential";
    readonly subjectId: string;
    readonly intent: AccountEventIntent;
}
export interface AccountEventStore {
    due(limit: number, now: number): Promise<readonly AccountEventRecord[]>;
    claim(record: AccountEventRecord, token: string, now: number, until: number): Promise<boolean>;
    finish(
        record: AccountEventRecord,
        token: string,
        outcome: { readonly dueAt: number | null; readonly expired?: boolean; readonly errorCode?: string },
    ): Promise<boolean>;
    current(record: AccountEventRecord): Promise<boolean>;
}
export interface AccountEventPublisher {
    publish(intent: AccountEventIntent): Promise<void>;
}

export interface AccountEventProfile {
    readonly createdAt: string;
    readonly email?: string;
}
export interface AccountEventProfiles {
    get(accountRef: string): Promise<AccountEventProfile | null>;
}
