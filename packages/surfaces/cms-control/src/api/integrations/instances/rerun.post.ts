import type { ControlCms } from "cms-control/ControlCms";
import { definitionsForRerun } from "cms-control/core/integrations/definitions";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import MissingParam from "cms-control/errors/Http/MissingParam";
import {
    runIntegrationInstance,
    type IntegrationImportDeps,
} from "@bernouy/cms-integrations";

export default async function postIntegrationInstanceRerun(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new MissingParam("id");
    const body = await readOptionalJsonBody(req);
    const definitions = await definitionsForRerun(cms.integrationCatalog, cms.integrationInstances, id, body);
    const deps: IntegrationImportDeps = {
        sources: cms.sources,
        secrets: cms.secrets,
    };
    const result = await runIntegrationInstance({
        mode: "rerun",
        deps,
        instances: cms.integrationInstances,
        instanceId: id,
        body,
        siteIntegrations: definitions,
    });
    return Response.json(result);
}

async function readOptionalJsonBody(req: Request): Promise<Record<string, unknown>> {
    const text = await req.text();
    if (!text.trim()) return {};
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        throw new InvalidParam("body", "JSON object expected.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new InvalidParam("body", "JSON object expected.");
    }
    return body as Record<string, unknown>;
}
