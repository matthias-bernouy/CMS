export function sourceArtifact(id: string, targetUrl = "https://api.example.com/items") {
    return {
        type: "source" as const,
        source: {
            id,
            meta: { name: id },
            endpoints: [
                {
                    endpointId: "list",
                    method: "GET" as const,
                    targetUrl,
                    params: [],
                    output: [{ status: "200" as const, body: { type: "object" as const } }],
                },
            ],
        },
    };
}
