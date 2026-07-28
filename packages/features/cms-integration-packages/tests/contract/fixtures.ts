import { INTEGRATION_PACKAGE_SCHEMA, type IntegrationPackageEnvelopeV1 } from "../../src/exports/index";

export function validPackageEnvelope(): IntegrationPackageEnvelopeV1 {
    return {
        schema: INTEGRATION_PACKAGE_SCHEMA,
        kind: "commerce",
        version: "1.2.3",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": {
                encoding: "utf8",
                content: '{"kind":"commerce","version":"1.2.3"}',
            },
            "release-notes.md": {
                encoding: "utf8",
                content: "## Changes\n\nCompatible update.",
            },
            "assets/icon.png": {
                encoding: "base64",
                content: "AAECAw==",
            },
        },
    };
}
