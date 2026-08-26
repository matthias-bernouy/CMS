import type { BuiltBloc } from "cms-cli/dev-server/bloc-build/index";
import { bundleBlocSource } from "cms-cli/push/blocs/bundle";
import type { BlocOwnership } from "@bernouy/cms-content";

export type RemoteBlocItem = {
    id: string;
    ownership: BlocOwnership;
};

export type PushBlocResult = {
    pushed: { tag: string }[];
    failed: { tag: string; error: string }[];
};

export async function fetchRemoteBlocList(adminBase: URL, token: string): Promise<RemoteBlocItem[]> {
    const url = new URL("api/bloc/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`GET ${url} -> HTTP ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) {
        throw new Error(`GET ${url} did not return a JSON array`);
    }
    return data
        .filter((bloc): bloc is { id: string; ownership?: unknown } => typeof bloc?.id === "string")
        .map((bloc) => ({ id: bloc.id, ownership: parseRemoteBlocOwnership(bloc.ownership, bloc.id) }));
}

export async function applyPushBlocs(
    adminBase: URL,
    token: string,
    blocs: Map<string, BuiltBloc>,
    force: boolean,
): Promise<PushBlocResult> {
    const result: PushBlocResult = { pushed: [], failed: [] };
    for (const [tag, bloc] of blocs) {
        try {
            await pushBloc(adminBase, token, bloc, force);
            result.pushed.push({ tag });
        } catch (err) {
            result.failed.push({ tag, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return result;
}

async function pushBloc(adminBase: URL, token: string, bloc: BuiltBloc, force: boolean): Promise<void> {
    const siteBuilder = bloc.ownership.kind === "site-builder";
    const url = new URL(siteBuilder ? "api/bloc/site-builder" : "api/bloc", adminBase).href;

    const form = new FormData();
    form.append("name", bloc.label);
    form.append("group", bloc.group);
    form.append("description", bloc.description);
    form.append("tag", bloc.tag);
    if (bloc.internal) {
        form.append("internal", "true");
    }
    if (force) {
        form.append("force", "true");
    }
    if (bloc.viewJS) {
        form.append("viewJS", new File([bloc.viewJS], `${bloc.tag}.js`, { type: "application/javascript" }));
    }
    if (bloc.compositionHTML !== undefined) {
        form.append("compositionHTML", bloc.compositionHTML);
    }
    if (bloc.editorJS) {
        form.append("editorJS", new File([bloc.editorJS], `${bloc.tag}Editor.js`, { type: "application/javascript" }));
    }

    const source = bloc.source ?? (await bundleBlocSource(bloc.folder));
    if (Object.keys(source).length > 0) {
        form.append("source", JSON.stringify(source));
    }
    if (siteBuilder) {
        const builder = source["builder.json"];
        if (!builder) {
            throw new Error(`Site-builder bloc "${bloc.tag}" has no builder.json`);
        }
        form.append("definition", Buffer.from(builder, "base64").toString("utf-8"));
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${url} -> HTTP ${res.status}${text ? " - " + text : ""}`);
    }
}

export function parseRemoteBlocOwnership(value: unknown, tag: string): BlocOwnership {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`GET api/bloc/list returned no ownership for bloc "${tag}"`);
    }
    const ownership = value as Partial<BlocOwnership>;
    if (ownership.kind === "code-managed") {
        return { kind: "code-managed" };
    }
    if (ownership.kind === "site-builder" && typeof ownership.definitionId === "string") {
        return { kind: "site-builder", definitionId: ownership.definitionId };
    }
    if (
        ownership.kind === "integration" &&
        typeof ownership.integrationKind === "string" &&
        typeof ownership.installationId === "string" &&
        typeof ownership.definitionVersion === "string"
    ) {
        return {
            kind: "integration",
            integrationKind: ownership.integrationKind,
            installationId: ownership.installationId,
            definitionVersion: ownership.definitionVersion,
        };
    }
    throw new Error(`GET api/bloc/list returned invalid ownership for bloc "${tag}"`);
}
