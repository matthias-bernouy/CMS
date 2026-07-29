import { sha256Hex } from "../../identity";
import type { SourceMediaIdentityValue } from "@bernouy/cms-sources";
import type { SourceMediaReference } from "../../../interfaces/media";

export async function sourceMediaAssetKey(reference: SourceMediaReference): Promise<string> {
    return `media-${await sha256Hex(JSON.stringify(canonicalReference(reference)))}`;
}

export async function sourceMediaLogicalKey(reference: SourceMediaReference, generation: string): Promise<string> {
    return `logical-${await sha256Hex(JSON.stringify({ reference: canonicalReference(reference), generation }))}`;
}

export async function sourceMediaGeneration(options: {
    reference: SourceMediaReference;
    revision?: SourceMediaIdentityValue;
    recipeId: string;
    encoderIdentity: string;
}): Promise<string> {
    const value = {
        reference: canonicalReference(options.reference),
        revision: options.revision === undefined ? null : canonicalScalar(options.revision),
        recipeId: options.recipeId,
        encoderIdentity: options.encoderIdentity,
    };
    return `generation-${await sha256Hex(JSON.stringify(value))}`;
}

function canonicalReference(reference: SourceMediaReference): unknown {
    return {
        scope: canonicalScope(reference.scope),
        installationId: reference.installationId,
        sourceId: reference.sourceId,
        endpointId: reference.endpointId,
        params: Object.entries(reference.params)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, value]) => [name, canonicalScalar(value)]),
    };
}

function canonicalScalar(value: SourceMediaIdentityValue): string {
    return String(value);
}

function canonicalScope(value: string): string {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.href;
}
