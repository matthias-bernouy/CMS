import { IntegrationRuntimeError } from "../../core/errors";

export class StripeProvisioningClient {
    constructor(
        private readonly secretKey: string,
        private readonly fetcher: typeof fetch,
        private readonly baseUrl = "https://api.stripe.com",
    ) {}

    async form<T>(
        path: string,
        method: "POST" | "DELETE" | "GET",
        version: string,
        body?: URLSearchParams,
        idempotencyKey?: string,
    ) {
        return await this.request<T>(path, {
            method,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                "Stripe-Version": version,
                ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
                ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            },
            ...(body ? { body } : {}),
        });
    }

    async json<T>(
        path: string,
        method: "POST" | "DELETE" | "GET",
        version: string,
        body?: Record<string, unknown>,
        idempotencyKey?: string,
    ) {
        return await this.request<T>(path, {
            method,
            headers: {
                Authorization: `Bearer ${this.secretKey}`,
                "Stripe-Version": version,
                ...(body ? { "Content-Type": "application/json" } : {}),
                ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    }

    private async request<T>(path: string, init: RequestInit): Promise<T> {
        let response: Response;
        try {
            response = await this.fetcher(`${this.baseUrl}${path}`, init);
        } catch {
            throw new IntegrationRuntimeError("Stripe provisioning request failed");
        }
        const payload = await parseResponse(response);
        if (!response.ok) {
            const message = stripeErrorMessage(payload).replaceAll(this.secretKey, "[redacted]");
            throw new IntegrationRuntimeError(
                `Stripe provisioning request failed (${response.status})${message ? `: ${message}` : ""}`,
                response.status >= 500 ? 502 : 400,
            );
        }
        return payload as T;
    }
}

async function parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new IntegrationRuntimeError(`Stripe provisioning returned invalid JSON (${response.status})`, 502);
    }
}

function stripeErrorMessage(value: unknown): string {
    if (!value || typeof value !== "object") {
        return "";
    }
    const error = "error" in value ? value.error : undefined;
    if (!error || typeof error !== "object" || !("message" in error)) {
        return "";
    }
    return typeof error.message === "string" ? error.message : "";
}
