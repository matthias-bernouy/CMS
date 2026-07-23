import type { SourceEndpoint } from "@bernouy/cms-sources";
import { callJson } from "./sourceCalls";
import type { NotificationDispatchOptions } from "./types";

export async function provisionTemplates(
    options: Pick<NotificationDispatchOptions, "deps">,
    templatesEndpoint: SourceEndpoint,
    installEndpoint: SourceEndpoint,
): Promise<void> {
    const payload = await callJson(templatesEndpoint, {}, options.deps);
    if (payload.contractVersion !== 1 || !Array.isArray(payload.items) || payload.items.length === 0) {
        throw new Error("notification template contract is invalid");
    }
    await callJson(installEndpoint, { templates: payload.items }, options.deps);
}
