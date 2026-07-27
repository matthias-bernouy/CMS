import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { sourceArtifact } from "../../helpers";

export function upgradableHookDefinition(): IntegrationDefinition {
    return {
        kind: "upgradable-hook",
        label: "Upgradable hook",
        inputs: [
            { name: "id", label: "Source id", type: "text", required: true },
            { name: "enabled", label: "Enabled", type: "boolean", required: true },
        ],
        afterInstallation: [
            {
                id: "sync-configuration",
                steps: [
                    {
                        id: "configuration",
                        call: {
                            source: "{{answers.id}}",
                            endpoint: "list",
                        },
                    },
                ],
            },
        ],
        artifacts: [sourceArtifact("{{answers.id}}", "https://configuration.test/{{answers.enabled}}")],
    };
}
