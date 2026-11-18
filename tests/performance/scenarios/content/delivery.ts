import { randomUUID } from "node:crypto";
import { assertCondition, requireRecord } from "../queries/types";
import type { PreparedSample } from "../../harness/execution/samples";
import type { ScenarioClient } from "../../harness/clients/session";
import type { Variant } from "../../capabilities/types";

export function assertDeliveryBody(
    output: unknown,
    marker: string,
    method: "GET" | "HEAD",
    stale?: string,
    minimumBytes = 0,
) {
    assertCondition(output instanceof Uint8Array);
    if (method === "HEAD") {
        assertCondition(output.byteLength === 0);
        return;
    }
    assertCondition(output.byteLength >= minimumBytes);
    const html = new TextDecoder().decode(output);
    assertCondition(html.includes(marker) && (!stale || !html.includes(stale)));
}

/** Every sample owns a published Page; concurrent calls never share a mutable revision. */
export async function prepareDelivery(
    client: ScenarioClient,
    binding: string,
    variant: Variant,
    method: "GET" | "HEAD" = "GET",
): Promise<PreparedSample> {
    const id = randomUUID();
    const path = `/performance-delivery-${id}`;
    const stale = `old-delivery-${id}`;
    const marker = `current-delivery-${id}`;
    const content = (text: string) =>
        `<div cms-bloc="ulvia-dtest--smoke-kit--card"><p slot="content">${text}${variant === "large" ? "x".repeat(256 * 1024) : ""}</p></div>`;
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await client("ulvia/cms.content", capability, "http", input);
        assertCondition(result.observation.validated);
        return requireRecord(result.output);
    };
    let page = await fixture("pages.create", { path, title: "Performance delivery fixture", content: content(stale) });
    const publish = async () => {
        page = await fixture("pages.publish", { id: page.id, expectedRevision: page.revision, visible: true });
    };
    try {
        await publish();
        const input = { path, method, query: [] };
        if (variant === "invalidation") {
            const primed = await client("ulvia/cms.content", "delivery.resolve-resource", binding, input, (output) =>
                assertDeliveryBody(output, stale, method),
            );
            assertCondition(primed.observation.validated);
        }
        const revisions = variant === "history" ? 16 : 1;
        for (let index = 0; index < revisions; index++) {
            page = await fixture("pages.update", {
                id: page.id,
                expectedRevision: page.revision,
                content: content(index + 1 === revisions ? marker : `previous-${id}-${index}`),
            });
            await publish();
        }
        const expectedRevision = page.revision;
        return {
            async send() {
                return (
                    await client("ulvia/cms.content", "delivery.resolve-resource", binding, input, (output) =>
                        assertDeliveryBody(output, marker, method, stale, variant === "large" ? 256 * 1024 : 0),
                    )
                ).observation;
            },
            async verify() {
                const current = await fixture("pages.get", { id: page.id });
                assertCondition(current.revision === expectedRevision && current.visible === true);
                assertCondition(String(current.content).includes(marker));
            },
            async close() {
                const current = await fixture("pages.get", { id: page.id });
                await fixture("pages.delete", { id: current.id, expectedRevision: current.revision });
            },
        };
    } catch (error) {
        const current = await fixture("pages.get", { id: page.id });
        await fixture("pages.delete", { id: current.id, expectedRevision: current.revision });
        throw error;
    }
}
