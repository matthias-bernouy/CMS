import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Runner } from "@bernouy/core";
import replaceBasePath from "./replaceBasePath";
import { STATIC_ROOT_DIR } from "./scanStaticFolder";

const TEMPLATE_FILE = "_template.html";

/**
 * Render a static file by wrapping it in the closest `_template.html` found
 * walking from the file's directory up to `static/`. Each subfolder can
 * therefore opt into a different shell (admin vs editor have different
 * needs around CSS isolation, for example) without every page having to
 * declare which template it expects.
 */
export default async function prepareHtml(
    path: string,
    runner: Runner,
){
    const templatePath = findTemplateFor(path);
    if (!templatePath) {
        throw new Error(`No _template.html found for ${path} (looked from its directory up to ${STATIC_ROOT_DIR}).`);
    }

    const content = replaceBasePath(await Bun.file(path).text(), runner.basePath);

    let temp = await Bun.file(templatePath).text();
    temp = replaceBasePath(temp, runner.basePath);
    temp = temp.replace("{{CONTENT}}", content);

    return temp;
}

function findTemplateFor(filePath: string): string | null {
    const rel = relative(STATIC_ROOT_DIR, filePath);
    if (rel.startsWith("..")) return null;          // outside static/
    let dir = dirname(filePath);
    while (dir.startsWith(STATIC_ROOT_DIR)) {
        const candidate = join(dir, TEMPLATE_FILE);
        if (existsSync(candidate)) return candidate;
        if (dir === STATIC_ROOT_DIR) break;
        dir = dirname(dir);
    }
    return null;
}
