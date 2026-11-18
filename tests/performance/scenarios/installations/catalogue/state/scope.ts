import { isolatedOrigin } from "../../../../harness/transport/http";
import { assertCondition } from "../../../queries/types";

/** Only an exact fresh-tenant alias on the owned disposable stack may receive trusted host fixture records. */
export function metadataFixtureScope(
    stack: Readonly<{ id: string; providerName: string }>,
    site: Readonly<{ url: string; instanceId: string }>,
    ingress: string,
) {
    const url = new URL(isolatedOrigin(site.url));
    const parent = new URL(isolatedOrigin(ingress));
    assertCondition(
        /^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) && stack.providerName === `${stack.id}-provider`,
        "metadata-fixture-stack-scope",
    );
    assertCondition(
        /^perf-flow-[a-f0-9]{24}\.localhost$/u.test(url.hostname) &&
            url.protocol === "http:" &&
            url.port === parent.port &&
            /^instance:[a-f0-9-]{36}$/u.test(site.instanceId),
        "metadata-fixture-tenant-scope",
    );
    return `${stack.id}-${url.hostname.slice(0, -".localhost".length)}`;
}
