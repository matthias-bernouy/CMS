import type { IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";

export type IntegrationCspExtras = {
    connectExtras: string[];
    mediaExtras:   string[];
    styleExtras:   string[];
    scriptExtras:  string[];
    frameExtras:   string[];
};

export function collectIntegrationDefinitionCspExtras(
    definitions: Iterable<IntegrationDefinition>,
): IntegrationCspExtras {
    const out = emptyIntegrationCspExtras();
    for (const definition of definitions) mergeDefinitionCsp(out, definition);
    return out;
}

export function collectIntegrationInstallationCspExtras(
    installations: Iterable<IntegrationInstallation>,
): IntegrationCspExtras {
    const definitions = [];
    for (const installation of installations) {
        if (installation.status !== "success" || !installation.definitionSnapshot) continue;
        definitions.push(installation.definitionSnapshot);
    }
    return collectIntegrationDefinitionCspExtras(definitions);
}

export function emptyIntegrationCspExtras(): IntegrationCspExtras {
    return {
        connectExtras: [],
        mediaExtras:   [],
        styleExtras:   [],
        scriptExtras:  [],
        frameExtras:   [],
    };
}

function mergeDefinitionCsp(out: IntegrationCspExtras, definition: IntegrationDefinition): void {
    const csp = definition.security?.csp;
    if (!csp) return;
    mergeSources(out.connectExtras, csp.connect);
    mergeSources(out.mediaExtras,   csp.media);
    mergeSources(out.styleExtras,   csp.style);
    mergeSources(out.scriptExtras,  csp.script);
    mergeSources(out.frameExtras,   csp.frame);
}

function mergeSources(target: string[], sources: string[] | undefined): void {
    if (!sources) return;
    for (const source of sources) {
        const normalized = normalizeCspSource(source);
        if (normalized && !target.includes(normalized)) target.push(normalized);
    }
}

function normalizeCspSource(source: string): string | null {
    try {
        return new URL(source).origin;
    } catch {
        return null;
    }
}
