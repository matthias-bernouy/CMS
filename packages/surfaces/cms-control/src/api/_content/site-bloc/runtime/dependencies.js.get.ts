import type { ControlCms } from "cms-control/ControlCms";
import { BlocRevisionConflictError } from "@bernouy/cms-content";
import { parseOptionalRevision, siteBlocTag } from "cms-control/core/content/siteBloc/dto";
import { requireSiteBloc } from "cms-control/core/content/siteBloc/service";
import {
    siteBlocDependencyGraph,
    transitiveDependencies,
} from "cms-control/core/content/siteBloc/validation/dependencies";

export default async function getSiteBlocDependencyScript(req: Request, cms: ControlCms) {
    const tag = siteBlocTag(req.url);
    const expectedRevision = parseOptionalRevision(new URL(req.url).searchParams.get("revision"));
    const [definition, records] = await Promise.all([requireSiteBloc(cms, tag), cms.repository.getBlocRecords()]);
    if (expectedRevision !== undefined && definition.draftRevision !== expectedRevision) {
        throw new BlocRevisionConflictError(tag, expectedRevision, definition.draftRevision);
    }
    const graph = siteBlocDependencyGraph(records);
    graph.set(tag, new Set(definition.draft.dependencies));
    const needed = new Set([...definition.draft.dependencies, ...transitiveDependencies(graph, tag)]);
    const script = records
        .filter((record) => needed.has(record.tag) && record.artifact)
        .map(
            (record) =>
                `try {\n${record.artifact!.viewJS}\n} catch (error) { console.error(${JSON.stringify(`[site-bloc] dependency ${record.tag}:`)}, error); }`,
        )
        .join("\n");
    return new Response(script, {
        headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "private, no-store" },
    });
}
