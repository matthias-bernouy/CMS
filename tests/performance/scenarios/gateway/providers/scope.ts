import { isolatedOrigin } from "../../../harness/transport/http";
import { ClientFailure } from "../../../harness/clients/failure";

export function settingsCredentialKey(
    stack: Readonly<{ id: string; providerName: string }>,
    site: Readonly<{ url: string; instanceId: string }>,
    ingress: string,
) {
    const url = new URL(isolatedOrigin(site.url));
    const parent = new URL(isolatedOrigin(ingress));
    if (
        !/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) ||
        stack.providerName !== `${stack.id}-provider` ||
        !/^perf-settings-\d+\.localhost$/u.test(url.hostname) ||
        url.protocol !== "http:" ||
        url.port !== parent.port ||
        !/^instance:[0-9a-f-]{36}$/u.test(site.instanceId)
    ) {
        throw new ClientFailure("gateway-provider-fixture-scope-mismatch");
    }
    return `${stack.id}-${url.hostname.slice(0, -".localhost".length)}`;
}
