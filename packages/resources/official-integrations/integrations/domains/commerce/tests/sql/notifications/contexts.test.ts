import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { loadIntegrationDefinition } from "../../../../../../tests/helpers/integrationDefinition";
import { notificationTemplates } from "../../../connectors/supabase/functions/cms-commerce/routes/notifications/templates";

type Definition = {
    artifacts: Array<{
        type: string;
        source?: { endpoints: Array<{ endpointId: string; output?: Array<{ body?: DataShape }> }> };
    }>;
};

const offer = { id: 91, slug: "sample-product", title: "Sample product" };
const proposal = {
    id: "00000000-0000-0000-0000-000000000003",
    status: "expired",
    previousStatus: "accepted",
    amountMinor: 12000,
    amountFormatted: "120.00 EUR",
    currency: "EUR",
};

describe("marketplace notification public contracts", () => {
    test("retains the published template preview envelope for every lifecycle sample", async () => {
        const definition = await loadIntegrationDefinition<Definition>(
            new URL("../../../definition.json", import.meta.url),
        );
        const source = definition.artifacts.find((artifact) => artifact.type === "source")?.source;
        const shape = source?.endpoints.find((endpoint) => endpoint.endpointId === "listDefaultNotificationTemplates")
            ?.output?.[0]?.body;
        if (!shape) {
            throw new Error("Notification template output shape is missing");
        }
        const payload = await notificationTemplates().json();
        expect(() => projectStrictDataShape(payload, shape, "response")).not.toThrow();
    });

    test("preserves offer and proposal snapshots through strict source projection without an order", async () => {
        const definition = await loadIntegrationDefinition<Definition>(
            new URL("../../../definition.json", import.meta.url),
        );
        const source = definition.artifacts.find((artifact) => artifact.type === "source")?.source;
        const shape = source?.endpoints.find((endpoint) => endpoint.endpointId === "claimNotifications")?.output?.[0]
            ?.body;
        if (!shape) {
            throw new Error("Notification claim output shape is missing");
        }
        for (const isProposal of [false, true]) {
            const payload = {
                items: [
                    {
                        deliveryId: "00000000-0000-0000-0000-000000000004",
                        recipientCmsUserId: "buyer-1",
                        templateKey: isProposal ? "commerce.buyer.proposal.expired" : "commerce.seller.offer.approved",
                        idempotencyKey: "commerce-notification:delivery-1",
                        context: {
                            contractVersion: 1,
                            event: { type: "lifecycle", occurredAt: "2026-10-16T10:00:00.000Z" },
                            recipient: { userId: "buyer-1", role: "buyer" },
                            offer,
                            ...(isProposal ? { proposal } : {}),
                            delivery: { status: "updated", label: "Updated" },
                            action: { path: "/account/negotiations" },
                            source: {},
                        },
                    },
                ],
            };
            expect(projectStrictDataShape(payload, shape, "response")).toEqual(payload);
        }
    });

    test("provides one editable template per lifecycle rule with complete sample tokens", async () => {
        const payload = (await notificationTemplates().json()) as {
            items: Array<{ key: string; requiredTokens: Array<{ name: string }>; sampleData: Record<string, unknown> }>;
        };
        const rules = await Bun.file(
            new URL(
                "../../../connectors/supabase/install/sql/foundation/notifications/activity/rules.sql",
                import.meta.url,
            ),
        ).text();
        const keys = [...rules.matchAll(/^    \('(commerce\.[^']+)'/gm)].map((match) => match[1]);
        expect(keys).toHaveLength(14);
        expect(new Set(payload.items.map((item) => item.key)).size).toBe(payload.items.length);
        for (const key of keys) {
            const template = payload.items.find((item) => item.key === key);
            expect(template).toBeDefined();
            if (!template) {
                throw new Error(`Missing lifecycle template ${key}`);
            }
            for (const token of template.requiredTokens) {
                const value = token.name
                    .split(".")
                    .reduce<unknown>(
                        (current, part) =>
                            current && typeof current === "object"
                                ? (current as Record<string, unknown>)[part]
                                : undefined,
                        template.sampleData,
                    );
                expect(typeof value).toBe("string");
            }
        }
    });
});
