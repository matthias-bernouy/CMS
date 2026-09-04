import { Buffer } from "node:buffer";
import type { IntegrationBlocArtifact, IntegrationDefinition } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

export function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    const manifest = JSON.parse(decodeSource(source?.["manifest.json"])) as { defaultContent?: string };
    const path = manifest.defaultContent?.replace(/^\.\//, "");
    return path ? decodeSource(source?.[path]) : undefined;
}

export function decodeSource(value: string | undefined): string {
    return value ? Buffer.from(value, "base64").toString("utf-8") : "";
}

export async function loadDefinition(): Promise<IntegrationDefinition> {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("ulvia", "2.1.0");
    if (!definition) {
        throw new Error('Integration "restaurant" definition not found');
    }
    return definition;
}

export async function loadRestaurantBloc(tag: string): Promise<IntegrationBlocArtifact> {
    const artifact = (await loadDefinition()).artifacts.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === tag,
    );
    if (!artifact || artifact.type !== "bloc") {
        throw new Error(`${tag} bloc not found`);
    }
    return artifact.bloc;
}
