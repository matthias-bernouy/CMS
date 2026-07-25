import { SourceImageProcessor } from "./processor/SourceImageProcessor";
import { sourceImageDisabledResponse } from "./responses";
import { SourceImageRequestTelemetry } from "./telemetry";
import type { CreateSourceImageInterceptorOptions, SourceImageInterceptor } from "./types";
import type { SourceImageObserver } from "../../interfaces/observability";

export function createSourceImageInterceptor(options: CreateSourceImageInterceptorOptions): SourceImageInterceptor {
    return new SourceImageProcessor(options).intercept;
}

export function createDisabledSourceImageInterceptor(observe?: SourceImageObserver): SourceImageInterceptor {
    return async (_endpoint, request, next) => {
        const url = new URL(request.url);
        const reserved = [...url.searchParams.keys()].filter((name) => name.trim().toLowerCase().startsWith("cms-"));
        if (reserved.length === 0) {
            return next(request);
        }
        const telemetry = new SourceImageRequestTelemetry(request, observe, Date.now);
        await telemetry.finish("rejected", "transforms_disabled");
        return sourceImageDisabledResponse();
    };
}

export type { CreateSourceImageInterceptorOptions, SourceImageInterceptor } from "./types";
