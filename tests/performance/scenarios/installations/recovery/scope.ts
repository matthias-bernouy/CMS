import { assertCondition } from "../../queries/types";

export function assertUpgradeSeedScope(stackId: string, providerName: string, instanceId: string, origin: string) {
    const url = new URL(origin);
    assertCondition(/^ulvia-mcp-[a-f0-9]{8}$/u.test(stackId) && providerName === `${stackId}-provider`);
    assertCondition(/^instance:[a-f0-9-]{36}$/u.test(instanceId));
    assertCondition(
        url.protocol === "http:" && url.origin === origin && /^perf-settings-\d{1,2}\.localhost$/u.test(url.hostname),
    );
    assertCondition(!url.username && !url.password && url.pathname === "/" && !url.search && !url.hash);
}
