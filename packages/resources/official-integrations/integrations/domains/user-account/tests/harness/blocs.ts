import { Buffer } from "node:buffer";
import type { IntegrationBlocArtifact } from "@bernouy/cms-integrations";

export function decodeBlocSource(bloc: IntegrationBlocArtifact | undefined, path: string): string {
    const encoded = bloc?.source?.[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
}
