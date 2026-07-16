import { Buffer } from "node:buffer";

type BlocArtifactSource = {
    viewJS?: string;
    source?: Record<string, string>;
};

export function declaredBlocViewSources(bloc: BlocArtifactSource): string {
    const relatedSources = Object.entries(bloc.source ?? {})
        .filter(([name]) => !["Bloc.ts", "BlocEditor.ts", "default.html"].includes(name)
            && /\.(?:[cm]?[jt]sx?|html|css)$/.test(name))
        .map(([, encoded]) => Buffer.from(encoded, "base64").toString("utf-8"));
    return [bloc.viewJS ?? "", ...relatedSources].join("\n");
}
