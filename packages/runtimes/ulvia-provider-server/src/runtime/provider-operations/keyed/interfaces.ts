export type KeyedOutcome =
    | Readonly<{ kind: "success"; output: unknown }>
    | Readonly<{ kind: "error"; code: string; status: number }>;

export interface KeyedReceipt {
    readonly id: string;
    readonly fingerprint: string;
    readonly state: "pending" | "complete";
    readonly outcome?: KeyedOutcome;
}

/** Claims are durable before any side effect. Pending claims never expire or transfer ownership. */
export interface KeyedReceiptStore {
    claim(id: string, fingerprint: string): Promise<Readonly<{ created: boolean; receipt: KeyedReceipt }>>;
    complete(id: string, fingerprint: string, outcome: KeyedOutcome): Promise<void>;
}
