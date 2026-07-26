import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";

export function publicationDocument(): string {
    return new TextDecoder().decode(
        canonicalJsonBytes({
            schema: "cms.integration.package.v1",
            kind: "remote-demo",
            version: "1.0.0",
            definition: "definition.json",
            releaseNotes: "README.md",
            files: {
                "README.md": { encoding: "utf8", content: "# Remote demo\n" },
                "definition.json": {
                    encoding: "utf8",
                    content: JSON.stringify({
                        kind: "remote-demo",
                        label: "Remote demo",
                        version: "1.0.0",
                        description: "Published through the management CMS",
                        inputs: [],
                    }),
                },
            },
        }),
    );
}
