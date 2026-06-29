import { mkdir, writeFile } from "node:fs/promises";
import { safeJoin } from "cms-cli/push/shared/safeJoin";
import { GENERATED_INTEGRATION_INSTANCES_FILE, GENERATED_SOURCES_DIR, SITE_INTEGRATIONS_DIR } from "cms-cli/dev-server/integrations";
import { parseUrn, sourceDtoToSource, type Source, type SourceDto } from "@bernouy/cms-sources";
import type { IntegrationInstance } from "@bernouy/cms-integrations";
import type { RemoteIntegrationDetail, RemoteIntegrationListItem } from "./pullTypes";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullIntegrationsResult = { pulled: string[]; failed: { id: string; error: string }[] };

/** The edit-form-enriched shape returned by `GET /api/sources?urn=`. */
type EnrichedEndpoint = Omit<SourceDto["endpoints"][number], "params"> & {
    params?: SourceDto["endpoints"][number]["params"];
};
type EnrichedSource = {
    urn: string;
    id: string;
    meta?: SourceDto["meta"];
    endpoints?: EnrichedEndpoint[];
};

/** Pull tracked integrations and their generated source artifacts. */
export async function pullIntegrations(adminBase: URL, token: string, siteDir: string): Promise<PullIntegrationsResult> {
    const out: PullIntegrationsResult = { pulled: [], failed: [] };
    const instances: IntegrationInstance[] = [];
    for (const { id } of await fetchList(adminBase, token)) {
        try {
            const detail = await fetchIntegration(adminBase, token, id);
            await writeIntegrationImport(siteDir, detail);
            for (const artifact of detail.artifacts) {
                if (artifact.type !== "source") continue;
                await writeGeneratedSource(siteDir, await fetchSource(adminBase, token, artifact.id));
            }
            instances.push(instanceFromDetail(detail));
            out.pulled.push(id);
        } catch (err) {
            out.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
    }
    if (instances.length > 0) await writeIntegrationInstances(siteDir, instances);
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<RemoteIntegrationListItem[]> {
    const url = new URL("api/integrations/instances", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as RemoteIntegrationListItem[];
}

async function fetchIntegration(adminBase: URL, token: string, id: string): Promise<RemoteIntegrationDetail> {
    const url = new URL(`api/integrations/instances?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as RemoteIntegrationDetail;
}

async function fetchSource(adminBase: URL, token: string, urn: string): Promise<Source> {
    const url = new URL(`api/sources?urn=${encodeURIComponent(urn)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return reconstructSource(await res.json() as EnrichedSource);
}

/**
 * Rebuild the canonical `Source` from the enriched edit-form response — the
 * inverse of `sources.get`'s flattening: re-derive each endpoint urn
 * from `id` + `endpointId`, and re-nest each param's scalar `type` back into a
 * `schema`. body / output / meta / headers ride along verbatim.
 */
export function reconstructSource(r: EnrichedSource): Source {
    return sourceDtoToSource({
        id: r.id,
        meta: r.meta ?? { name: r.id },
        endpoints: (r.endpoints ?? []).map(e => ({
            endpointId: e.endpointId,
            method: e.method,
            targetUrl: e.targetUrl,
            params: (e.params ?? []).map(p => ({
                name: p.name,
                in: p.in,
                ...(p.type ? { type: p.type } : {}),
                ...(p.required ? { required: true } : {}),
                ...(p.description ? { description: p.description } : {}),
            })),
            ...(e.body !== undefined ? { body: e.body } : {}),
            ...(e.output !== undefined ? { output: e.output } : {}),
            ...(e.meta !== undefined ? { meta: e.meta } : {}),
            ...(e.headers !== undefined ? { headers: e.headers } : {}),
        })),
    });
}

async function writeGeneratedSource(siteDir: string, source: Source): Promise<void> {
    const id   = parseUrn(source.urn)?.source ?? "source";
    const dir  = safeJoin(siteDir, GENERATED_SOURCES_DIR);
    const file = safeJoin(dir, `${id}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(source, null, 2) + "\n", "utf-8");
}

async function writeIntegrationImport(siteDir: string, detail: RemoteIntegrationDetail): Promise<void> {
    const dir = safeJoin(siteDir, SITE_INTEGRATIONS_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(safeJoin(dir, `${slug(detail.id)}.json`), JSON.stringify({
        kind: detail.kind,
        ...(detail.definition ? { definition: detail.definition } : {}),
        answers: detail.answers ?? {},
        instance: {
            id: detail.id,
            label: detail.label,
        },
    }, null, 2) + "\n", "utf-8");
}

async function writeIntegrationInstances(siteDir: string, instances: IntegrationInstance[]): Promise<void> {
    const file = safeJoin(siteDir, GENERATED_INTEGRATION_INSTANCES_FILE);
    await mkdir(safeJoin(siteDir, ".p9r/generated"), { recursive: true });
    await writeFile(file, JSON.stringify(instances, null, 2) + "\n", "utf-8");
}

function instanceFromDetail(detail: RemoteIntegrationDetail): IntegrationInstance {
    return {
        id: detail.id,
        kind: detail.kind,
        label: detail.label,
        definitionVersion: detail.definitionVersion,
        ...(detail.definition ? { definitionSnapshot: detail.definition } : {}),
        status: detail.status,
        createdAt: new Date(detail.createdAt),
        updatedAt: new Date(detail.updatedAt),
        runCount: detail.runCount,
        answersSnapshot: detail.answers ?? {},
        secretRefs: {},
        secretInputs: detail.secretInputs ?? [],
        artifacts: detail.artifacts.map(({ exists: _exists, ...artifact }) => artifact),
        runs: (detail.runs ?? []).map(run => ({
            ...run,
            startedAt: new Date(run.startedAt),
            finishedAt: new Date(run.finishedAt),
        })),
    };
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "integration";
}
