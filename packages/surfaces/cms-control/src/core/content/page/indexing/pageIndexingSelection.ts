import {
    detectPageIndexingCandidates,
    validatePageIndexingConfiguration,
    type PageIndexingConfiguration,
    type TPage,
} from "@bernouy/cms-content";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { pageIndexingCandidateValue } from "cms-control/core/content/page/indexing/pageIndexingEditor";
import { validateIndexingProjection } from "cms-control/core/content/page/indexing/pageIndexingProjectionValidation";

export type PageIndexingSelectionUpdate = {
    enabled: boolean;
    candidate?: string;
    projection?: {
        identityPath?: string;
        discover?: NonNullable<NonNullable<PageIndexingConfiguration["entity"]>["discover"]>;
    };
};

export async function resolvePageIndexingSelection(
    page: TPage,
    capabilities: readonly GatewayEditorCapability[],
    update: PageIndexingSelectionUpdate,
): Promise<PageIndexingConfiguration> {
    if (!update.candidate) {
        return { enabled: update.enabled };
    }
    const candidate = detectPageIndexingCandidates(page.content).candidates.find(
        (item) => pageIndexingCandidateValue(item) === update.candidate,
    );
    if (!candidate) {
        throw new InvalidParam("indexingCandidate", "It no longer matches an indexable binding on this page.");
    }
    const capability = capabilities.find(
        (item) => item.contractId === candidate.contractId && item.capabilityId === candidate.capabilityId,
    );
    if (!capability || capability.effect !== "query" || capability.output.type !== "object") {
        throw new InvalidParam("indexingCandidate", "The selected gateway capability is unavailable.");
    }
    const identity = capability.output.properties[candidate.inputParam];
    if (!identity || (identity.type !== "string" && identity.type !== "integer" && identity.type !== "number")) {
        throw new InvalidParam("indexingCandidate", "The response does not declare its canonical identity.");
    }
    const variables: NonNullable<PageIndexingConfiguration["entity"]>["variables"] = {};
    for (const [name, schema] of Object.entries(capability.output.properties).slice(0, 32)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(name)) {
            continue;
        }
        if (schema.type === "string") {
            variables[name] = {
                path: name,
                type: schema.format === "date" || schema.format === "date-time" ? "date" : "text",
            };
        } else if (schema.type === "number" || schema.type === "integer") {
            variables[name] = { path: name, type: "number" };
        }
    }
    const existing = page.indexing?.entity;
    const same =
        existing?.contractId === candidate.contractId &&
        existing.resolve.capabilityId === candidate.capabilityId &&
        existing.resolve.inputParam === candidate.inputParam &&
        existing.pageQueryParam === candidate.pageQueryParam;
    const selected = same
        ? existing
        : {
              contractId: candidate.contractId,
              label: capability.description ?? capability.capabilityId,
              pageQueryParam: candidate.pageQueryParam,
              resolve: {
                  capabilityId: candidate.capabilityId,
                  inputParam: candidate.inputParam,
                  identityPath: candidate.inputParam,
              },
              variables,
          };
    const discovery = update.projection?.discover;
    const result = validatePageIndexingConfiguration({
        enabled: update.enabled,
        entity: {
            ...selected,
            resolve: {
                ...selected.resolve,
                ...(update.projection?.identityPath ? { identityPath: update.projection.identityPath } : {}),
            },
            ...(discovery ? { discover: discovery } : {}),
        },
    });
    validateIndexingProjection(result.entity!, capability, capabilities);
    return result;
}
