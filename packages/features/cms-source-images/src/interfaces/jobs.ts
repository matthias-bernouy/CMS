import type { SourceImageReason } from "./observability";
import type { SourceImageWidth } from "./recipe";

export const SOURCE_IMAGE_JOB_VERSION = 2 as const;

export const SOURCE_IMAGE_JOB_SOURCE_HEADERS = ["accept", "accept-language", "content-type"] as const;
export type SourceImageJobSourceHeader = (typeof SOURCE_IMAGE_JOB_SOURCE_HEADERS)[number];

export type SourceImageJob = Readonly<{
    version: typeof SOURCE_IMAGE_JOB_VERSION;
    deduplicationKey: string;
    source: Readonly<{
        url: string;
        headers: Readonly<Partial<Record<SourceImageJobSourceHeader, string>>>;
    }>;
    logicalKey: string;
    variants: readonly Readonly<{ lookupKey: string; width: SourceImageWidth }>[];
    recipeId: string;
    encoderIdentity: string;
    priority: SourceImageJobPriority;
    asset?: Readonly<{ key: string; generation: string }>;
}>;

export type SourceImageJobPriority = "media-critical" | "media-cache";

export type SourceImageJobEnqueueResult = "accepted" | "duplicate" | "saturated";

/** Implementations may persist this JSON-safe job in a local or remote queue. */
export interface SourceImageJobScheduler {
    enqueue(job: SourceImageJob): Promise<SourceImageJobEnqueueResult>;
}

export type SourceImageJobClaimRequest = Readonly<{
    owner: string;
    now: number;
    leaseMs: number;
    priorities: readonly SourceImageJobPriority[];
}>;

export type SourceImageJobClaim = Readonly<{
    job: SourceImageJob;
    token: string;
    owner: string;
    attempts: number;
}>;

export type SourceImageJobRetry = Readonly<{
    token: string;
    owner: string;
    availableAt: number;
    reason: string;
}>;

export interface SourceImageJobQueue extends SourceImageJobScheduler {
    claim(request: SourceImageJobClaimRequest): Promise<SourceImageJobClaim | null>;
    renew(claim: Pick<SourceImageJobClaim, "token" | "owner"> & { now: number; leaseMs: number }): Promise<boolean>;
    complete(claim: Pick<SourceImageJobClaim, "token" | "owner">): Promise<boolean>;
    retry(retry: SourceImageJobRetry): Promise<boolean>;
    waitForAvailable?(timeoutMs: number): Promise<void>;
}

export type SourceImageJobResult =
    | Readonly<{
          disposition: "completed";
          variants?: readonly Readonly<{ width: SourceImageWidth; lookupKey: string; derivativeKey: string }>[];
      }>
    | Readonly<{ disposition: "discarded" | "retry"; reason: SourceImageReason | "invalid_job" }>;

/** A remote queue consumer acknowledges or retries according to this result. */
export interface SourceImageJobHandler {
    handle(job: SourceImageJob): Promise<SourceImageJobResult>;
}

export type SourceImageJobFetch = (request: Request) => Promise<Response>;
