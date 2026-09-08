import type { IntegrationEndpointContext } from "../../../interfaces/Integration/endpoint";
import { parseUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import type { IntegrationManagementActor } from "../../../interfaces/Integration/management";
import type { IntegrationRuntimeDeps } from "../management/contracts";
import { IntegrationRuntimeError } from "../../errors";
import { withManagementLease } from "../management/lease";
import {
    declaredFieldSecretRefs,
    managementSecrets,
    publicResult,
    readPath,
    settingSecretRefs,
} from "../management/secrets";
import { resolveManagementPages } from "../management/pages";
import { record } from "../management/report";
import { integrationFormFields } from "./fields";
import { completeIntegrationEndpoint } from "./completion";

/** A normal source operation owns its workflow. The host supplies scoped context and completes host-owned work. */
export async function executeIntegrationEndpoint(
    deps: IntegrationRuntimeDeps,
    endpoint: SourceEndpoint,
    request: Request,
    next: (request: Request) => Promise<Response>,
    actor?: IntegrationManagementActor,
): Promise<Response> {
    const urn = parseUrn(endpoint.urn);
    if (
        !urn ||
        !endpoint.integrationContext ||
        endpoint.method !== "POST" ||
        request.method !== "POST" ||
        endpoint.access?.mode !== "admin"
    ) {
        throw new IntegrationRuntimeError("Integration context requires an admin POST endpoint", 403);
    }
    const owners = (await deps.installations.list()).filter(
        (installation) =>
            installation.artifacts.some(
                (artifact) =>
                    artifact.type === "source" && (parseUrn(artifact.id)?.source ?? artifact.id) === urn.source,
            ) &&
            installation.definitionSnapshot?.artifacts?.some(
                (artifact) =>
                    artifact.type === "source" &&
                    artifact.source.id === urn.source &&
                    artifact.source.endpoints.some(
                        (candidate) => candidate.endpointId === urn.endpoint && candidate.integrationContext,
                    ),
            ),
    );
    if (owners.length !== 1) {
        throw new IntegrationRuntimeError("Integration endpoint ownership is unavailable", 409);
    }
    const text = await request.text();
    if (text.length > 1_000_000) {
        throw new IntegrationRuntimeError("Integration request is too large", 413);
    }
    let input: unknown;
    try {
        input = JSON.parse(text);
    } catch {
        throw new IntegrationRuntimeError("Invalid integration JSON request", 400);
    }
    if (!record(input) || Object.hasOwn(input, "_cms")) {
        throw new IntegrationRuntimeError("Integration context is server-owned", 400);
    }
    const body = input;
    return withManagementLease(deps, owners[0]!.id, async (installation) => {
        let refs = installation.managementSecretRefs ?? {};
        const pages: IntegrationEndpointContext["resolvedPages"] = {};
        for (const form of integrationFormFields(installation.definitionSnapshot, {
            source: urn.source,
            endpoint: urn.endpoint!,
        })) {
            const values = form.valuesPath ? readPath(body, form.valuesPath) : body;
            if (!record(values)) {
                throw new IntegrationRuntimeError("Invalid integration form values", 400);
            }
            const selected = settingSecretRefs(form.fields, values, refs);
            const granted = new Set(Object.keys(declaredFieldSecretRefs(form.fields, refs)));
            refs = { ...Object.fromEntries(Object.entries(refs).filter(([key]) => !granted.has(key))), ...selected };
            Object.assign(pages, await resolveManagementPages(deps, form.fields, values));
        }
        const secrets = await managementSecrets(deps, installation, refs);
        const redacted = [...Object.values(secrets.secretValues), ...Object.values(secrets.generatedSecretValues)];
        const response = await next(
            new Request(request.url, {
                method: request.method,
                headers: request.headers,
                body: JSON.stringify({
                    ...body,
                    _cms: {
                        installationId: installation.id,
                        definitionVersion: installation.definitionVersion,
                        actor,
                        secretValues: secrets.secretValues,
                        generatedSecretValues: secrets.generatedSecretValues,
                        resolvedPages: pages,
                    } satisfies IntegrationEndpointContext,
                }),
            }),
        );
        const output = await response.text();
        if (output.length > 1_000_000) {
            throw new IntegrationRuntimeError("Integration response is too large", 502);
        }
        let result: unknown;
        try {
            result = JSON.parse(output);
        } catch {
            throw new IntegrationRuntimeError("Invalid integration response", 502);
        }
        if (!record(result)) {
            throw new IntegrationRuntimeError("Invalid integration response", 502);
        }
        if (!response.ok) {
            return Response.json(publicResult(result, redacted), { status: response.status });
        }
        if (Object.hasOwn(result, "_cms")) {
            throw new IntegrationRuntimeError("Integration responses cannot contain server context", 502);
        }
        redacted.push(...(await completeIntegrationEndpoint(deps, installation, result, refs, secrets.secretValues)));
        return Response.json(publicResult(result, redacted), { status: response.status });
    });
}
