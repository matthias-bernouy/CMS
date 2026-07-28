import type {
    RepositoryManagementGatewayRequest,
    RepositoryManagementGatewayTransport,
} from "@bernouy/cms-repository-management/gateway";
import type { RepositoryManagementGatewayRuntimeConfig } from "./config";
import { readRepositoryManagementUpstreamToken } from "./credentials";

type HttpRepositoryManagementGatewayConfig = Readonly<{
    baseUrl: string;
    token: string;
    timeoutMs: number;
    fetch?: typeof fetch;
}>;

export async function createProductionRepositoryManagementGateway(
    config: RepositoryManagementGatewayRuntimeConfig | undefined,
): Promise<RepositoryManagementGatewayTransport | undefined> {
    if (!config) {
        return undefined;
    }
    return new HttpRepositoryManagementGateway({
        baseUrl: config.url,
        token: await readRepositoryManagementUpstreamToken(config.tokenFile),
        timeoutMs: config.timeoutMs,
    });
}

export class HttpRepositoryManagementGateway implements RepositoryManagementGatewayTransport {
    private readonly fetchImpl: typeof fetch;

    constructor(private readonly config: HttpRepositoryManagementGatewayConfig) {
        if (!config.token || /\s/u.test(config.token)) {
            throw new TypeError("Repository management upstream token is invalid");
        }
        if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) {
            throw new TypeError("Repository management upstream timeout is invalid");
        }
        this.fetchImpl = config.fetch ?? fetch;
    }

    async forward(input: RepositoryManagementGatewayRequest): Promise<Response> {
        const url = new URL(`.${input.path}${input.query}`, `${this.config.baseUrl}/`);
        const headers = new Headers({
            authorization: `Bearer ${this.config.token}`,
            "x-p9r-authenticated-actor": encodeURIComponent(input.actor),
        });
        if (input.body) {
            headers.set("content-length", String(input.body.byteLength));
            headers.set("content-type", input.contentType ?? "application/json");
        }
        try {
            return await this.fetchImpl(url, {
                method: input.method,
                headers,
                body: input.body ? new Uint8Array(input.body) : undefined,
                redirect: "error",
                signal: AbortSignal.timeout(this.config.timeoutMs),
            });
        } catch {
            throw new Error("Repository management upstream request failed");
        }
    }
}
