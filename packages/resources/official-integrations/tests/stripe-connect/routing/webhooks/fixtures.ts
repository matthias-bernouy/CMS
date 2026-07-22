type WebhookCase = {
    route: string;
    secret: string;
    event: Record<string, unknown>;
    accountId: string;
    objectId: string;
};

export function webhookCases(created: number): WebhookCase[] {
    return [
        {
            route: "stripe",
            secret: "whsec_test_123",
            event: baseEvent("evt_platform_contract", created),
            accountId: "platform",
            objectId: "object_contract",
        },
        {
            route: "stripe-connect",
            secret: "whsec_connect_test_456",
            event: { ...baseEvent("evt_connect_contract", created), account: "acct_connect_contract" },
            accountId: "acct_connect_contract",
            objectId: "object_contract",
        },
        {
            route: "stripe-connect-v2",
            secret: "whsec_connect_v2_test_789",
            event: {
                ...baseEvent("evt_connect_v2_contract", new Date(created * 1000).toISOString()),
                type: "v2.core.account.updated",
                related_object: { id: "acct_connect_v2_contract", type: "v2.core.account" },
            },
            accountId: "acct_connect_v2_contract",
            objectId: "object_contract",
        },
    ];
}

export function baseEvent(eventId: string, created: number | string): Record<string, unknown> {
    return {
        id: eventId,
        type: "test_helpers.test_clock.ready",
        api_version: "2026-02-25.clover",
        created,
        livemode: false,
        data: { object: { id: "object_contract" } },
    };
}
