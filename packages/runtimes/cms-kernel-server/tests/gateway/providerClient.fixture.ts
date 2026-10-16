import { ProviderKernelClient } from "../../src/runtime/provider/ProviderKernelClient";
import { ProviderKernelTransport } from "../../src/runtime/provider/ProviderKernelTransport";

export interface CapturedProviderRequest {
    url: URL;
    init: RequestInit;
    body?: { operation?: string; input?: unknown };
}

export function clientFixture(
    respond: (request: CapturedProviderRequest) => Response | Promise<Response>,
    kernelUrl = "https://kernel.test",
): { client: ProviderKernelClient; requests: CapturedProviderRequest[] } {
    const requests: CapturedProviderRequest[] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const captured: CapturedProviderRequest = {
            url: new URL(url.toString()),
            init: init ?? {},
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        };
        requests.push(captured);
        return respond(captured);
    };
    const transport = new ProviderKernelTransport(
        "http://ulvia-provider:5103",
        "provider-token-at-least-twenty",
        fetcher as typeof fetch,
    );
    return { client: new ProviderKernelClient(transport, kernelUrl), requests };
}
