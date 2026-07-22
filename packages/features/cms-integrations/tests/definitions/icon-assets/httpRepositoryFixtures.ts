import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";

export function repositoryWithAsset(
    asset: () => Response | Promise<Response>,
    definitionValue: Record<string, unknown> = definition(),
): HttpIntegrationDefinitionRepository {
    return new HttpIntegrationDefinitionRepository({
        baseUrl: "https://repo.example.test",
        fetch: async (input) => {
            const url = input instanceof URL ? input : new URL(String(input));
            if (url.pathname.endsWith("/definition")) {
                return Response.json(definitionValue);
            }
            if (url.pathname.endsWith("/asset")) {
                return asset();
            }
            return Response.json({}, { status: 404 });
        },
    });
}

export function definition(svg?: string): Record<string, unknown> {
    return {
        kind: "remote-icons",
        label: "Remote icons",
        version: "2.1.0",
        inputs: [],
        artifacts: [sourceArtifact("remote", "assets/source.svg", svg)],
    };
}

export function sourceArtifact(id: string, path: string, svg?: string): Record<string, unknown> {
    return {
        type: "source",
        source: {
            id,
            meta: { name: id, icon: { path }, ...(svg ? { svg } : {}) },
            endpoints: [],
        },
    };
}
