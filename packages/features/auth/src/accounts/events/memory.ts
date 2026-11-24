import { accountEventIntent } from "./intent";
import { internalUserId } from "auth/accounts/core/SubjectResolver";
import type { AccountEventIntent, AccountEventRecord, AccountEventStore, AccountEventProfile } from "./interfaces";

/** Explicit development/test journal. Mongo embeds the intent in the business mutation instead. */
export class InMemoryAccountEventStore implements AccountEventStore {
    private readonly records = new Map<string, AccountEventRecord>();
    private readonly members = new Map<string, { reference: string; createdAt: string }>();
    private readonly references = new Map<string, string>();
    constructor(
        private readonly isCurrent: (record: AccountEventRecord) => Promise<boolean>,
        private readonly readProfile?: (accountId: string) => Promise<AccountEventProfile | null>,
    ) {}
    bindMemberReference(accountId: string, reference: string, createdAt: string) {
        this.members.set(accountId, { reference, createdAt });
        this.references.set(reference, accountId);
    }
    reference(accountId: string, createdAt: string): string {
        const member = this.members.get(accountId);
        if (!member || member.createdAt !== createdAt) {
            throw new TypeError("Account Event reference unavailable");
        }
        return member.reference;
    }
    async profile(reference: string): Promise<AccountEventProfile | null> {
        const accountId = this.references.get(reference);
        if (!accountId) {
            return null;
        }
        if (!this.readProfile) {
            throw new TypeError("Account Event profile reader required");
        }
        return this.readProfile(accountId);
    }
    record(source: AccountEventRecord["source"], subjectId: string, intent: AccountEventIntent) {
        const checked = accountEventIntent(intent);
        if (
            checked.type !== (source === "member" ? "account.created" : "account.email-verified") ||
            checked.accountId !== (source === "member" ? subjectId : internalUserId("local", subjectId))
        ) {
            throw new TypeError("Account Event owner mismatch");
        }
        this.records.set(`${source}:${subjectId}`, structuredClone({ source, subjectId, intent: checked }));
    }
    remove(source: AccountEventRecord["source"], subjectId: string) {
        this.records.delete(`${source}:${subjectId}`);
        if (source === "member") {
            const member = this.members.get(subjectId);
            if (member) {
                this.references.delete(member.reference);
            }
            this.members.delete(subjectId);
        }
    }
    async due(limit: number, now: number) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
            throw new TypeError("Invalid Event batch");
        }
        return [...this.records.values()]
            .filter(({ intent }) => intent.dueAt !== null && Date.parse(intent.dueAt) <= now)
            .sort((a, b) => a.intent.dueAt!.localeCompare(b.intent.dueAt!))
            .slice(0, limit)
            .map((record) => structuredClone(record));
    }
    async claim(record: AccountEventRecord, token: string, now: number, until: number) {
        if (record.intent.attempts >= Number.MAX_SAFE_INTEGER) {
            throw new TypeError("Invalid Account Event attempts");
        }
        const current = this.records.get(`${record.source}:${record.subjectId}`);
        if (
            !current ||
            current.intent.occurrenceId !== record.intent.occurrenceId ||
            !current.intent.dueAt ||
            Date.parse(current.intent.dueAt) > now ||
            current.intent.attempts !== record.intent.attempts
        ) {
            return false;
        }
        this.record(record.source, record.subjectId, {
            ...current.intent,
            state: "sending",
            token,
            dueAt: new Date(until).toISOString(),
            attempts: current.intent.attempts + 1,
        });
        return true;
    }
    async finish(record: AccountEventRecord, token: string, outcome: Parameters<AccountEventStore["finish"]>[2]) {
        const key = `${record.source}:${record.subjectId}`;
        const current = this.records.get(key);
        if (!current || current.intent.occurrenceId !== record.intent.occurrenceId || current.intent.token !== token) {
            return false;
        }
        if (outcome.dueAt === null && !outcome.expired) {
            this.records.delete(key);
        } else {
            this.record(record.source, record.subjectId, {
                ...current.intent,
                token: null,
                state: outcome.expired ? "expired" : "pending",
                dueAt: outcome.dueAt === null ? null : new Date(outcome.dueAt).toISOString(),
                errorCode: outcome.errorCode ?? null,
            });
        }
        return true;
    }
    async current(record: AccountEventRecord) {
        const member = this.members.get(record.intent.accountId);
        return Boolean(
            member &&
                member.reference === record.intent.accountRef &&
                member.createdAt === record.intent.accountCreatedAt &&
                (await this.isCurrent(record)),
        );
    }
}
