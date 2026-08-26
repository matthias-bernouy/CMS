import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import type { DeclarativeArtifactTemplate } from "../../../interfaces/Integration";
import { isRecord, text } from "../definition/values";

export function parseBlocTemplate(
    value: Record<string, unknown>,
    name: string,
): Extract<DeclarativeArtifactTemplate, { type: "bloc" }>["bloc"] {
    const tag = text(value.tag);
    const blocName = text(value.name);
    const viewJS = executableSource(value.viewJS);
    const compositionHTML = executableSource(value.compositionHTML);
    const editorJS = executableSource(value.editorJS);
    if (!tag) {
        throw new MissingIntegrationParam(`${name}.tag`);
    }
    if (!blocName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    return {
        tag,
        name: blocName,
        ...(text(value.group) ? { group: text(value.group)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(value.internal === true ? { internal: true } : {}),
        ...(text(value.path) ? { path: text(value.path)! } : {}),
        ...(text(value.view) ? { view: text(value.view)! } : {}),
        ...(text(value.composition) ? { composition: text(value.composition)! } : {}),
        ...(value.editor === null ? { editor: null } : text(value.editor) ? { editor: text(value.editor)! } : {}),
        ...(viewJS !== undefined ? { viewJS } : {}),
        ...(compositionHTML !== undefined ? { compositionHTML } : {}),
        ...(value.editorJS === null ? { editorJS: null } : editorJS !== undefined ? { editorJS } : {}),
        ...(value.source !== undefined ? { source: parseSourceBundle(value.source, `${name}.source`) } : {}),
    };
}

function executableSource(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
}

function parseSourceBundle(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const out: Record<string, string> = {};
    for (const [path, content] of Object.entries(value)) {
        if (typeof content !== "string") {
            throw new IntegrationInputError(`${name}.${path}`, "must be a string");
        }
        out[path] = content;
    }
    return out;
}
