export const SOURCE_IMAGE_STAGES = ["upstream", "read", "decode", "semaphore_wait", "encode", "store"] as const;
export type SourceImageStage = (typeof SOURCE_IMAGE_STAGES)[number];

export const SOURCE_IMAGE_OUTCOMES = [
    "passthrough",
    "rejected",
    "upstream_response",
    "cache_hit",
    "generated",
    "fallback",
    "failed",
] as const;
export type SourceImageOutcome = (typeof SOURCE_IMAGE_OUTCOMES)[number];

export const SOURCE_IMAGE_REASONS = [
    "not_requested",
    "ineligible_endpoint",
    "transforms_disabled",
    "unsupported_parameter",
    "invalid_width",
    "range_request",
    "upstream_status",
    "upstream_content_type",
    "source_too_large",
    "read_timeout",
    "invalid_image",
    "animated_image",
    "pixel_limit",
    "cache_stale",
    "semaphore_saturated",
    "processing_failed",
] as const;
export type SourceImageReason = (typeof SOURCE_IMAGE_REASONS)[number];

export type SourceImageObservation = Readonly<{
    outcome: SourceImageOutcome;
    reason?: SourceImageReason;
    policy?: "public" | "private";
    width?: number;
    cache?: "hit" | "miss" | "stale";
    joinedSingleFlight?: boolean;
    evicted?: number;
    cacheErrors?: number;
    stagesMs: Readonly<Partial<Record<SourceImageStage, number>>>;
    sourceBytes?: number;
    outputBytes?: number;
    compressionRatio?: number;
}>;

export type SourceImageObserver = (observation: SourceImageObservation) => void | Promise<void>;
