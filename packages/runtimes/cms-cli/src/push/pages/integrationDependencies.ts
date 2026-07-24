import type { IntegrationAnswerValue, IntegrationDefinition } from "@bernouy/cms-integrations";
import { loadPushConfig } from "../shared/config";
import { fetchRemoteIntegrationDefinitions } from "../integrations/apply";
import { scanIntegrations } from "../integrations/scan";
import { fetchRemoteList } from "./apply";
import { fetchRemotePageState } from "./classify";
import { runPages, type RunPagesFlags } from "./run";
import { scanPages } from "./scan";

export async function runIntegrationPageDependencies(
    adminBase: URL,
    token: string,
    flags: RunPagesFlags,
): Promise<number> {
    const config = await loadPushConfig(process.cwd());
    const integrations = await scanIntegrations(config.siteDir);
    const needsRemote = integrations.some(({ request }) => !request.definition);
    const remote = needsRemote ? await fetchRemoteIntegrationDefinitions(adminBase, token) : [];
    const remoteByKind = new Map(remote.map((definition) => [definition.kind, definition]));
    const paths = new Set<string>();
    for (const { request } of integrations) {
        const definition = request.definition ?? remoteByKind.get(request.kind);
        if (!definition) {
            console.error(`✖ Integration definition "${request.kind}" is unavailable.`);
            return 1;
        }
        collectPageDependencies(definition, request.answers, paths);
    }
    if (paths.size === 0) {
        console.log("→ No integration page-link dependencies. Skipping.");
        return 0;
    }

    const local = await scanPages(config.siteDir);
    const localByPath = new Map(local.map((page) => [page.path, page]));
    const remotePaths = new Set((await fetchRemoteList(adminBase, token)).map((page) => page.path));
    for (const path of paths) {
        const page = localByPath.get(path);
        if (!page && !remotePaths.has(path)) {
            console.error(`✖ Integration page-link "${path}" is missing locally and remotely.`);
            return 1;
        }
        if (page && !page.frontmatter.visible) {
            console.error(`✖ Integration page-link "${path}" must be published (visible: true).`);
            return 1;
        }
    }
    const code = await runPages(adminBase, token, { ...flags, onlyPaths: paths });
    if (code !== 0 || flags.dryRun) {
        return code;
    }
    return verifyPublishedDependencies(adminBase, token, paths, localByPath);
}

export function collectPageDependencies(
    definition: IntegrationDefinition,
    answers: Record<string, IntegrationAnswerValue>,
    target = new Set<string>(),
): Set<string> {
    for (const input of definition.inputs) {
        const value = answers[input.name];
        if (input.type !== "object-list" || !Array.isArray(value)) {
            continue;
        }
        for (const row of value) {
            if (!isRecord(row)) {
                continue;
            }
            for (const field of input.fields) {
                if (field.type === "page-link") {
                    addPagePath(target, row[field.name]);
                }
            }
        }
    }
    return target;
}

function addPagePath(target: Set<string>, value: unknown): void {
    if (value === undefined || value === null || value === "") {
        return;
    }
    if (typeof value !== "string" || !/^\/(?:[^?#]*)$/.test(value.trim())) {
        throw new Error("Integration page-link answers must be absolute paths without a query or fragment");
    }
    target.add(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function verifyPublishedDependencies(
    adminBase: URL,
    token: string,
    paths: ReadonlySet<string>,
    localByPath: ReadonlyMap<string, Awaited<ReturnType<typeof scanPages>>[number]>,
): Promise<number> {
    const remote = new Map((await fetchRemoteList(adminBase, token)).map((page) => [page.path, page.id]));
    for (const path of paths) {
        const id = remote.get(path);
        if (!id) {
            console.error(`✖ Integration page-link "${path}" was not published.`);
            return 1;
        }
        const state = await fetchRemotePageState(adminBase, token, id);
        if (!state.visible) {
            console.error(`✖ Integration page-link "${path}" is not published remotely.`);
            return 1;
        }
        const local = localByPath.get(path);
        if (local && state.hash !== local.hash) {
            console.error(`✖ Integration page-link "${path}" differs from the local version after prepublication.`);
            return 1;
        }
    }
    return 0;
}
