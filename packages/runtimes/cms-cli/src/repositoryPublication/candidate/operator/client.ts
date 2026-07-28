import {
    type DecisionReference,
    type RepositoryOperatorClientConfig,
    type RepositoryOperatorRequest,
    type RepositoryOperatorResult,
} from "./contracts";
import { invalidOperatorResponse } from "./http";
import { getOperatorResource, postOperatorMutation } from "./requests";
import { parseCompatibilityReference, parseReleaseDecision, parseVersionForBlock } from "./responses";

const COMPATIBILITY_PATH = "/api/integrations/compatibility";
const RELEASE_PATH = "/api/integrations/release";
const STABLE_PROMOTIONS_PATH = "/api/integrations/stable-promotions";
const VERSION_BLOCKS_PATH = "/api/integrations/version-blocks";
const VERSIONS_PATH = "/api/integrations/versions";
const REEVALUATIONS_PATH = "/api/integrations/compatibility/reevaluations";

export async function executeRepositoryOperator(
    config: RepositoryOperatorClientConfig,
    request: RepositoryOperatorRequest,
): Promise<RepositoryOperatorResult> {
    const deadline = Date.now() + config.timeoutMs;
    if (request.type === "promote-stable") {
        return await promote(config, request, deadline);
    }
    if (request.type === "block") {
        return await block(config, request, deadline);
    }
    return await reevaluate(config, request, deadline);
}

async function promote(
    config: RepositoryOperatorClientConfig,
    request: Extract<RepositoryOperatorRequest, { type: "promote-stable" }>,
    deadline: number,
): Promise<RepositoryOperatorResult> {
    const release = await getOperatorResource(config, RELEASE_PATH, request, deadline);
    if ("outcome" in release) {
        return release;
    }
    const decision = parseReleaseDecision(release.body, request.kind, request.version);
    if (!decision) {
        return invalidOperatorResponse(release.response.status);
    }
    const result = await postOperatorMutation(
        config,
        STABLE_PROMOTIONS_PATH,
        request,
        {
            kind: request.kind,
            version: request.version,
            currentReportRevisionId: decision.revisionId,
            confirmation: { version: request.version, reportRevisionId: decision.revisionId },
            ...(request.reason ? { reason: request.reason } : {}),
        },
        deadline,
    );
    return result.outcome === "completed" ? { outcome: "promoted", reference: result.reference } : result;
}

async function block(
    config: RepositoryOperatorClientConfig,
    request: Extract<RepositoryOperatorRequest, { type: "block" }>,
    deadline: number,
): Promise<RepositoryOperatorResult> {
    const versions = await getOperatorResource(config, VERSIONS_PATH, request, deadline, false);
    if ("outcome" in versions) {
        return versions;
    }
    const metadata = parseVersionForBlock(versions.body, request.kind, request.version);
    if (!metadata) {
        return invalidOperatorResponse(versions.response.status);
    }
    const result = await postOperatorMutation(
        config,
        VERSION_BLOCKS_PATH,
        request,
        blockBody(request, metadata.decision),
        deadline,
    );
    if (result.outcome !== "completed") {
        return result;
    }
    return result.preview
        ? { outcome: "blocked", reference: result.reference, preview: result.preview }
        : invalidOperatorResponse(201);
}

async function reevaluate(
    config: RepositoryOperatorClientConfig,
    request: Extract<RepositoryOperatorRequest, { type: "reevaluate" }>,
    deadline: number,
): Promise<RepositoryOperatorResult> {
    const compatibility = await getOperatorResource(config, COMPATIBILITY_PATH, request, deadline);
    if ("outcome" in compatibility) {
        return compatibility;
    }
    const report = parseCompatibilityReference(compatibility.body, request.kind, request.version);
    if (!report) {
        return invalidOperatorResponse(compatibility.response.status);
    }
    const release = await getOperatorResource(config, RELEASE_PATH, request, deadline);
    if ("outcome" in release) {
        return release;
    }
    const decision = parseReleaseDecision(release.body, request.kind, request.version);
    if (!decision) {
        return invalidOperatorResponse(release.response.status);
    }
    const result = await postOperatorMutation(
        config,
        REEVALUATIONS_PATH,
        request,
        {
            kind: request.kind,
            version: request.version,
            currentReport: report,
            currentDecision: decision,
            reason: request.reason,
        },
        deadline,
    );
    return result.outcome === "completed" ? { outcome: "reevaluated", reference: result.reference } : result;
}

function blockBody(request: Extract<RepositoryOperatorRequest, { type: "block" }>, decision: DecisionReference) {
    return {
        kind: request.kind,
        version: request.version,
        currentDecision: decision,
        reason: request.reason,
        confirmation: {
            action: "block",
            kind: request.kind,
            version: request.version,
            decisionRevisionId: decision.revisionId,
            decisionDigest: decision.digest,
        },
    };
}
