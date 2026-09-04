import { Buffer } from "node:buffer";
import type { IntegrationBlocArtifact, IntegrationDefinition } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

export function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    const manifest = decodeJson<{ defaultContent?: string }>(source?.["manifest.json"]);
    const path = manifest?.defaultContent?.replace(/^\.\//, "");
    return path ? decodeSource(source?.[path]) : undefined;
}

export function decodeSource(value: string | undefined): string {
    return value ? Buffer.from(value, "base64").toString("utf-8") : "";
}

export async function loadDefinition(): Promise<IntegrationDefinition> {
    const definition = (await loadDefinitions()).find(({ kind }) => kind === "ulvia");
    if (!definition) {
        throw new Error('Integration "ulvia" definition not found');
    }
    return definition;
}

export async function loadDefinitions(): Promise<IntegrationDefinition[]> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    return (await Promise.all((await repository.list()).map(({ kind }) => repository.get(kind)))).filter(
        (definition): definition is IntegrationDefinition => definition !== null,
    );
}

export async function loadBloc(tag: string): Promise<IntegrationBlocArtifact> {
    const artifact = (await loadDefinition()).artifacts.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === tag,
    );
    if (!artifact || artifact.type !== "bloc") {
        throw new Error(`${tag} bloc not found`);
    }
    return artifact.bloc;
}

function decodeJson<T>(value: string | undefined): T | undefined {
    const source = decodeSource(value);
    return source ? (JSON.parse(source) as T) : undefined;
}
