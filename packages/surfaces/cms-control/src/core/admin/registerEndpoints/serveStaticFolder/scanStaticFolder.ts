import { Glob } from "bun";
import { join, resolve } from "node:path";

const CONTROL_RENDERED_TEMPLATES = new Set(["login.html", "forbidden.html"]);

export async function scanStaticFolder() {
    const rootDir = resolve(import.meta.dir, "../../../../static");

    const glob = new Glob("**/*");

    const files: { relativePath: string; absolutePath: string }[] = [];
    for (const scannedPath of glob.scanSync(rootDir)) {
        const sourceRelativePath = toRouteRelativePath(scannedPath);
        // Full-page auth templates are rendered explicitly by ControlCms because
        // the login page is intentionally unguarded while the static tree is not.
        // These root-relative paths are the canonical render targets.
        if (CONTROL_RENDERED_TEMPLATES.has(sourceRelativePath)) {
            continue;
        }
        // Skip per-folder template wrappers — they're consumed by `prepareHtml`,
        // not exposed as routes.
        if (sourceRelativePath.split("/").some((segment) => segment === "_template.html")) {
            continue;
        }

        const absolutePath = join(rootDir, sourceRelativePath);
        files.push({
            relativePath: publicStaticPath(sourceRelativePath),
            absolutePath,
        });
    }

    return files;
}

export function toRouteRelativePath(path: string): string {
    return path.replaceAll("\\", "/");
}

export function publicStaticPath(path: string): string {
    return path
        .split("/")
        .filter((segment) => !segment.startsWith("_"))
        .join("/");
}

export const STATIC_ROOT_DIR = resolve(import.meta.dir, "../../../../static");
