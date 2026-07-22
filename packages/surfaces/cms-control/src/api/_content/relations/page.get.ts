import { RelationResolutionError, resolveRelationPage } from "@bernouy/cms-relations";
import type { CmsRelation, RelationRepository } from "@bernouy/cms-relations";
import type { ExecutorDeps } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

type RelationPageCmsExtensions = {
    relations: RelationRepository;
    sourceExecutorDeps?: ExecutorDeps;
};

export default async function getRelationPage(req: Request, cms: ControlCms): Promise<Response> {
    const extensions = cms as ControlCms & RelationPageCmsExtensions;
    const url = new URL(req.url);
    const relationId = url.searchParams.get("relation") ?? "";
    const fromId = url.searchParams.get("fromId") ?? "";
    if (!relationId) {
        return new Response("missing relation", { status: 400 });
    }
    if (!fromId) {
        return new Response("missing fromId", { status: 400 });
    }

    const relation = await extensions.relations.getRelation(relationId);
    if (!relation) {
        return new Response("relation not found", { status: 404 });
    }

    try {
        const result = await resolveRelationPage(
            relation,
            fromItemForRelation(relation, fromId),
            {
                limit: integerParam(url.searchParams.get("limit")),
                offset: integerParam(url.searchParams.get("offset")),
                cursor: url.searchParams.get("cursor") ?? undefined,
            },
            {
                sources: cms.sources,
                ...extensions.sourceExecutorDeps,
                callerAccessMode: "admin",
            },
        );
        return Response.json(result);
    } catch (error) {
        if (error instanceof RelationResolutionError) {
            return new Response(error.message, { status: error.status });
        }
        throw error;
    }
}

function fromItemForRelation(relation: CmsRelation, id: string): Record<string, unknown> {
    const path = relation.from.idPath ?? "id";
    const root: Record<string, unknown> = {};
    setPath(root, path, id);
    return root;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current = target;
    for (const part of parts.slice(0, -1)) {
        const next = current[part];
        if (typeof next === "object" && next !== null && !Array.isArray(next)) {
            current = next as Record<string, unknown>;
        } else {
            const created: Record<string, unknown> = {};
            current[part] = created;
            current = created;
        }
    }
    current[parts.at(-1) ?? "id"] = value;
}

function integerParam(value: string | null): number | undefined {
    if (value === null || value === "") {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
}
