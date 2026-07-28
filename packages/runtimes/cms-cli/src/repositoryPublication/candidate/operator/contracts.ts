export type RepositoryOperatorClientConfig = Readonly<{
    managementUrl: string;
    token: string;
    timeoutMs: number;
    fetch?: typeof fetch;
}>;

export type RepositoryOperatorRequest =
    | Readonly<{ type: "promote-stable"; kind: string; version: string; reason?: string }>
    | Readonly<{ type: "block"; kind: string; version: string; reason: string }>
    | Readonly<{ type: "reevaluate"; kind: string; version: string; reason: string }>;

export type RepositoryOperatorResult =
    | Readonly<{ outcome: "promoted" | "reevaluated"; reference: string }>
    | Readonly<{ outcome: "blocked"; reference: string; preview: ChannelPreview }>
    | Readonly<{
          outcome: "failed";
          reason: "invalid-response" | "timeout" | "transport" | "upstream";
          status?: number;
          code?: string;
          retryAfterSeconds?: number;
      }>;

export type DecisionReference = Readonly<{ revisionId: string; digest: string }>;
export type ReportReference = Readonly<{ revisionId: string; reportDigest: string }>;
export type ChannelPreview = Readonly<{
    current: Readonly<{ stable?: string; latest?: string }>;
    next: Readonly<{ stable?: string; latest?: string }>;
}>;

export type RepositoryOperatorMutationSuccess = Readonly<{
    reference: string;
    preview?: ChannelPreview;
}>;
