import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { sourceArtifact } from "../../helpers";

export function rerunDefinition(version: string, targetUrl: string): IntegrationDefinition {
    return {
        kind: "rerun-definition",
        label: "Rerun definition",
        version,
        category: "Test",
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        artifacts: [sourceArtifact("{{answers.id}}", targetUrl)],
    };
}
