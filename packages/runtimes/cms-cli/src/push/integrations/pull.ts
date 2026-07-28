import { mkdir, writeFile } from "node:fs/promises";
import { safeJoin } from "cms-cli/push/shared/safeJoin";
import { categoryToFolder } from "cms-cli/push/shared/categoryFolder";
import {
    GENERATED_BLOCS_DIR,
    GENERATED_INTEGRATION_INSTALLATIONS_FILE,
    GENERATED_SOURCES_DIR,
    SITE_INTEGRATIONS_DIR,
} from "cms-cli/dev-server/integrations";
import { fetchBlocSource, fetchRemoteBlocList, writeBlocSource } from "cms-cli/push/blocs/pull";
import { assertSafeBlocTag } from "cms-cli/push/blocs/pullLocation";
import { parseUrn, type Source } from "@bernouy/cms-sources";
import { isExactIntegrationVersion, type IntegrationInstallation } from "@bernouy/cms-integrations";
import type { RemoteIntegrationDetail, RemoteIntegrationListItem } from "./pullTypes";
import { reconstructSource } from "./sourceReconstruction";

export { reconstructSource } from "./sourceReconstruction";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullIntegrationsResult = { pulled: string[]; failed: { id: string; error: string }[] };

/** Pull tracked integrations and their generated source artifacts. */
export async function pullIntegrations(
    adminBase: URL,
    token: string,
    siteDir: string,
): Promise<PullIntegrationsResult> {
    const out: PullIntegrationsResult = { pulled: [], failed: [] };
    const installations: IntegrationInstallation[] = [];
    let blocGroups: Map<string, string> | null = null;
    for (const { id } of await fetchList(adminBase, token)) {
        try {
            const detail = await fetchIntegration(adminBase, token, id);
            await writeIntegrationImport(siteDir, detail);
            for (const artifact of detail.artifacts) {
                if (artifact.type === "source") {
                    await writeGeneratedSource(siteDir, await fetchSource(adminBase, token, artifact.id));
                }
                if (artifact.type === "bloc") {
                    blocGroups ??= new Map(
                        (await fetchRemoteBlocList(adminBase, token)).map((bloc) => [bloc.tag, bloc.group]),
                    );
                    await writeGeneratedBloc(
                        siteDir,
                        artifact.id,
                        blocGroups.get(artifact.id) ?? "",
                        await fetchRequiredBlocSource(adminBase, token, artifact.id),
                    );
                }
            }
            installations.push(installationFromDetail(detail));
            out.pulled.push(id);
        } catch (err) {
            out.failed.push({ id, error: err instanceof Error ? err.message : String(err) });
        }
    }
    if (installations.length > 0) {
        await writeIntegrationInstallations(siteDir, installations);
    }
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<RemoteIntegrationListItem[]> {
    const url = new URL("api/integrations/installations", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    return (await res.json()) as RemoteIntegrationListItem[];
}

async function fetchIntegration(adminBase: URL, token: string, id: string): Promise<RemoteIntegrationDetail> {
    const url = new URL(`api/integrations/installations?id=${encodeURIComponent(id)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    return (await res.json()) as RemoteIntegrationDetail;
}

async function fetchSource(adminBase: URL, token: string, urn: string): Promise<Source> {
    const url = new URL(`api/sources?urn=${encodeURIComponent(urn)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    return reconstructSource(await res.json());
}

async function writeGeneratedSource(siteDir: string, source: Source): Promise<void> {
    const id = parseUrn(source.urn)?.source ?? "source";
    const dir = safeJoin(siteDir, GENERATED_SOURCES_DIR);
    const file = safeJoin(dir, `${id}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(source, null, 2) + "\n", "utf-8");
}

async function fetchRequiredBlocSource(adminBase: URL, token: string, tag: string): Promise<Record<string, string>> {
    const source = await fetchBlocSource(adminBase, token, tag);
    if (!source) {
        throw new Error(`bloc "${tag}" has no source bundle on the server`);
    }
    return source;
}

async function writeGeneratedBloc(
    siteDir: string,
    tag: string,
    group: string,
    source: Record<string, string>,
): Promise<void> {
    assertSafeBlocTag(tag);
    await writeBlocSource(safeJoin(siteDir, GENERATED_BLOCS_DIR, categoryToFolder(group), tag), source);
}

async function writeIntegrationImport(siteDir: string, detail: RemoteIntegrationDetail): Promise<void> {
    const dir = safeJoin(siteDir, SITE_INTEGRATIONS_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(
        safeJoin(dir, `${slug(detail.id)}.json`),
        JSON.stringify(
            {
                kind: detail.id,
                ...(isExactIntegrationVersion(detail.definitionVersion) ? { version: detail.definitionVersion } : {}),
                ...(detail.definition ? { definition: detail.definition } : {}),
                answers: detail.answers ?? {},
            },
            null,
            2,
        ) + "\n",
        "utf-8",
    );
}

async function writeIntegrationInstallations(siteDir: string, installations: IntegrationInstallation[]): Promise<void> {
    const file = safeJoin(siteDir, GENERATED_INTEGRATION_INSTALLATIONS_FILE);
    await mkdir(safeJoin(siteDir, ".p9r/generated"), { recursive: true });
    await writeFile(file, JSON.stringify(installations, null, 2) + "\n", "utf-8");
}

function installationFromDetail(detail: RemoteIntegrationDetail): IntegrationInstallation {
    return {
        id: detail.id,
        label: detail.label,
        definitionVersion: detail.definitionVersion,
        ...(detail.packageDigest ? { packageDigest: detail.packageDigest } : {}),
        ...(detail.definition ? { definitionSnapshot: detail.definition } : {}),
        status: detail.status,
        createdAt: new Date(detail.createdAt),
        updatedAt: new Date(detail.updatedAt),
        runCount: detail.runCount,
        answersSnapshot: detail.answers ?? {},
        secretRefs: {},
        secretInputs: detail.secretInputs ?? [],
        artifacts: detail.artifacts.map(({ exists: _exists, ...artifact }) => artifact),
        runs: (detail.runs ?? []).map((run) => ({
            ...run,
            startedAt: new Date(run.startedAt),
            finishedAt: new Date(run.finishedAt),
        })),
    };
}

function slug(value: string): string {
    return (
        value
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "integration"
    );
}
