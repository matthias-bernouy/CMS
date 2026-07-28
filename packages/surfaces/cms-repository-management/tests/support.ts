import type { RateLimiter, RateLimitResult } from "@bernouy/rate-limiter";

export class RecordingRateLimiter implements RateLimiter {
    readonly keys: string[] = [];

    constructor(
        private readonly result: RateLimitResult = { allowed: true },
        private readonly failure?: Error,
    ) {}

    async hit(key: string): Promise<RateLimitResult> {
        this.keys.push(key);
        if (this.failure) {
            throw this.failure;
        }
        return this.result;
    }

    async reset(): Promise<void> {}
}

export function managementRequest(authorization?: string): Request {
    return new Request("http://localhost/.cms/repository-management/api/integrations", {
        method: "POST",
        headers: authorization ? { authorization } : undefined,
        body: '{"files":{}}',
    });
}

export async function json(response: Response): Promise<Record<string, unknown>> {
    return response.json() as Promise<Record<string, unknown>>;
}
