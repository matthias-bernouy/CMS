export function newsletterSource() {
    return {
        urn: "urn:newsletter",
        meta: { name: "Newsletter" },
        endpoints: [
            {
                urn: "urn:newsletter:listSubscriptions",
                method: "GET" as const,
                targetUrl: "https://newsletter.test/subscriptions",
                input: {
                    params: [
                        { name: "subscribed", in: "query" as const, schema: { type: "string" as const } },
                        { name: "limit", in: "query" as const, schema: { type: "number" as const } },
                        { name: "offset", in: "query" as const, schema: { type: "number" as const } },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object" as const,
                            properties: {
                                subscriptions: {
                                    type: "array" as const,
                                    items: {
                                        type: "object" as const,
                                        properties: { email: { type: "string" as const } },
                                    },
                                },
                                total: { type: "number" as const },
                            },
                        },
                    },
                ],
            },
        ],
    };
}
