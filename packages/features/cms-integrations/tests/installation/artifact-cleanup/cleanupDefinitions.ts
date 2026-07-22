import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { runtimeRepositoryArtifacts } from "./runtimeRepositoryArtifacts";
import { runtimeSourceArtifacts } from "./runtimeSourceArtifacts";

export function definition(kind: string, version: string, includeArtifacts: boolean): IntegrationDefinition {
    return {
        kind,
        label: "Cleanup",
        version,
        inputs: [],
        ...(includeArtifacts
            ? {
                  artifacts: [
                      {
                          type: "source",
                          source: {
                              id: "legacy-source",
                              meta: { name: "Legacy source" },
                              endpoints: [
                                  {
                                      endpointId: "read",
                                      method: "GET",
                                      targetUrl: "https://example.com/legacy",
                                      params: [],
                                      output: [{ status: "200", body: { type: "object" } }],
                                  },
                              ],
                          },
                      },
                      legacyFunctionArtifact(),
                  ],
              }
            : {}),
    };
}

export function functionDefinition(kind: string, version: string, includeArtifact: boolean): IntegrationDefinition {
    return {
        kind,
        label: kind,
        version,
        inputs: [],
        ...(includeArtifact ? { artifacts: [legacyFunctionArtifact()] } : {}),
    };
}

export function runtimeArtifactsDefinition(version: string, includeArtifacts: boolean): IntegrationDefinition {
    return {
        kind: "runtime-cleanup",
        label: "Runtime cleanup",
        version,
        inputs: [],
        ...(includeArtifacts ? { artifacts: [...runtimeSourceArtifacts(), ...runtimeRepositoryArtifacts()] } : {}),
    };
}

export function blocDefinition(version: string, includeArtifact: boolean): IntegrationDefinition {
    return {
        kind: "bloc-cleanup",
        label: "Bloc cleanup",
        version,
        inputs: [],
        ...(includeArtifact
            ? {
                  artifacts: [
                      {
                          type: "bloc",
                          bloc: {
                              tag: "legacy-card",
                              name: "Legacy card",
                              viewJS: "customElements.define('legacy-card', class extends HTMLElement {});",
                          },
                      },
                  ],
              }
            : {}),
    };
}

function legacyFunctionArtifact() {
    return {
        type: "function" as const,
        function: {
            id: "legacyFunction",
            method: "POST" as const,
            steps: [],
            return: { body: { ok: true } },
        },
    };
}
