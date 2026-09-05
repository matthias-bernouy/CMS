import { Buffer } from "node:buffer";
import { validateBloc } from "@bernouy/cms-bloc-compile";
import { managedNativeElementIssue } from "@bernouy/cms-content";
import {
    assertCollectionConformance,
    collectionSelectableResources,
    resolveCollectionSelection,
    type CollectionIntegrationDefinition,
} from "@bernouy/cms-integrations";
import type { LocalReleaseVerificationInput, LocalReleaseVerificationResult } from "../types";

export function verifyCollectionRelease(
    input: LocalReleaseVerificationInput,
    log: (message: string) => void,
): LocalReleaseVerificationResult {
    const candidate = input.candidate.definition as CollectionIntegrationDefinition;
    const available = [input.candidate, ...input.availablePackages, ...input.baselines].map(
        ({ definition }) => definition,
    );
    assertCollectionConformance(candidate, available);
    log(`✓ collection contracts: ${candidate.resources.length} resource(s) resolved`);

    for (const artifact of candidate.artifacts ?? []) {
        const source = artifact.bloc.viewJS;
        const validation = validateBloc({
            tag: artifact.bloc.tag,
            ...(source ? { viewSource: source } : {}),
            ...(artifact.bloc.editorJS ? { editorSource: artifact.bloc.editorJS } : {}),
        });
        if (validation.errors.length) {
            throw new Error(`Invalid bloc ${artifact.bloc.tag}: ${validation.errors.join("; ")}`);
        }
        if (!source && !artifact.bloc.compositionHTML?.trim()) {
            throw new Error(`Bloc ${artifact.bloc.tag} has no hydrated view or composition`);
        }
        const defaultContent = readDefaultContent(artifact.bloc.source);
        if (artifact.bloc.nativeElement && defaultContent !== undefined) {
            const issue = managedNativeElementIssue(
                defaultContent,
                [{ tag: artifact.bloc.tag, nativeElement: artifact.bloc.nativeElement }],
                { requireExactlyOneHost: true },
            );
            if (issue) {
                throw new Error(`Invalid bloc ${artifact.bloc.tag}: ${issue}`);
            }
        }
    }
    log(`✓ collection UI: ${(candidate.artifacts ?? []).length} bloc artifact(s) compiled or validated`);

    for (const baseline of input.baselines) {
        const previous = baseline.definition;
        if (previous.schema !== "cms.integration.definition.v2" || previous.type !== "collection") {
            continue;
        }
        resolveCollectionSelection(
            candidate,
            undefined,
            collectionSelectableResources(previous).map(({ id }) => id),
            available,
        );
    }
    const scenarioCount = 1 + input.baselines.length;
    log(`✓ collection upgrade verification passed for ${scenarioCount} scenario(s)`);
    return { scenarioCount, resilienceScenarioCount: 0 };
}

function readDefaultContent(source: Record<string, string> | undefined): string | undefined {
    const manifestSource = source?.["manifest.json"] ?? source?.["./manifest.json"];
    if (!manifestSource) {
        return undefined;
    }
    const manifest = JSON.parse(Buffer.from(manifestSource, "base64").toString("utf8")) as {
        defaultContent?: string;
    };
    const path = manifest.defaultContent?.replace(/^\.\//, "");
    const encoded = path ? (source?.[path] ?? source?.[`./${path}`]) : undefined;
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : undefined;
}
