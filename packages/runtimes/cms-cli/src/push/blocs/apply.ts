import type { BuiltBloc } from "cms-cli/dev-server/build";
import { bundleBlocSource } from "cms-cli/push/blocs/bundle";

export type RemoteBlocItem = {
    id: string;
};

export type PushBlocResult = {
    pushed: { tag: string }[];
    failed: { tag: string; error: string }[];
};

export async function fetchRemoteBlocList(adminBase: URL, token: string): Promise<RemoteBlocItem[]> {
    const url = new URL("api/bloc/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) throw new Error(`GET ${url} did not return a JSON array`);
    return data
        .filter((b): b is { id: string } => typeof b?.id === "string")
        .map(b => ({ id: b.id }));
}

export async function applyPushBlocs(
    adminBase: URL,
    token:     string,
    blocs:     Map<string, BuiltBloc>,
    force:     boolean,
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
    const url = new URL("api/bloc", adminBase).href;

    const form = new FormData();
    form.append("name",        bloc.label);
    form.append("group",       bloc.group);
    form.append("description", bloc.description);
    form.append("tag",         bloc.tag);
    if (force) form.append("force", "true");
    form.append(
        "viewJS",
        new File([bloc.viewJS], `${bloc.tag}.js`, { type: "application/javascript" }),
    );
    if (bloc.editorJS) {
        form.append(
            "editorJS",
            new File([bloc.editorJS], `${bloc.tag}Editor.js`, { type: "application/javascript" }),
        );
    }

    const source = await bundleBlocSource(bloc.folder);
    if (Object.keys(source).length > 0) form.append("source", JSON.stringify(source));

    const res = await fetch(url, {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body:    form,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${url} -> HTTP ${res.status}${text ? " - " + text : ""}`);
    }
}
