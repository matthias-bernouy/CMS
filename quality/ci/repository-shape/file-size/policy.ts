import { extname } from "node:path";

export const TARGET_FILE_LINES = 150;
export const LARGE_FILE_LINES = 180;

const governedExtensions = new Set([
    ".astro",
    ".bash",
    ".c",
    ".cjs",
    ".conf",
    ".cpp",
    ".cs",
    ".css",
    ".cts",
    ".gql",
    ".go",
    ".graphql",
    ".h",
    ".hpp",
    ".htm",
    ".html",
    ".ini",
    ".java",
    ".js",
    ".jsx",
    ".json",
    ".jsonc",
    ".kt",
    ".kts",
    ".less",
    ".mdx",
    ".mjs",
    ".mts",
    ".php",
    ".prisma",
    ".properties",
    ".proto",
    ".py",
    ".rb",
    ".rs",
    ".sass",
    ".scss",
    ".sh",
    ".sql",
    ".svelte",
    ".toml",
    ".ts",
    ".tsx",
    ".vue",
    ".yaml",
    ".yml",
]);

const exactExceptions = new Map([
    [
        "packages/surfaces/cms-control/src/static/assets/control-components.js",
        "generated Control browser bundle",
    ],
    ["quality/ci/coverage/baseline.json", "generated per-package coverage snapshot"],
]);

const governedNames = new Set(["Containerfile", "Dockerfile", "Justfile", "Makefile"]);
const generatedLockfiles = new Set(["npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml"]);

function categorizedException(path: string): string | undefined {
    const name = path.split("/").at(-1) ?? path;
    if (generatedLockfiles.has(name)) return "generated dependency lockfile";
    if (/^packages\/resources\/official-integrations\/integrations\/[^/]+\/versions\/[^/]+\/definition\.json$/.test(path)) {
        return "atomic official-integration definition";
    }
    if (/^packages\/resources\/official-integrations\/integrations\/[^/]+\/versions\/[^/]+\/connectors\/[^/]+\/schema\.sql$/.test(path)) {
        return "atomic official-integration database schema";
    }
    return undefined;
}

export type FileSizeFinding = {
    path: string;
    currentLines: number;
    severity: "info" | "warning";
};

export function countPhysicalLines(source: string): number {
    if (source.length === 0) return 0;
    const lines = source.split(/\r\n|\n|\r/).length;
    return /(?:\r\n|\n|\r)$/.test(source) ? lines - 1 : lines;
}

export function isGovernedFile(path: string): boolean {
    const name = path.split("/").at(-1) ?? path;
    const isNamedSource = governedNames.has(name) || /^(?:Containerfile|Dockerfile|Justfile|Makefile)\..+$/.test(name);
    const isGoverned = isNamedSource || governedExtensions.has(extname(path).toLowerCase());
    return isGoverned && fileSizeException(path) === undefined;
}

export function fileSizeException(path: string): string | undefined {
    return exactExceptions.get(path) ?? categorizedException(path);
}

export function findFileSizeFindings(currentLines: ReadonlyMap<string, number>): FileSizeFinding[] {
    const findings: FileSizeFinding[] = [];
    for (const [path, lines] of currentLines) {
        if (!isGovernedFile(path) || lines <= TARGET_FILE_LINES) continue;
        findings.push({
            path,
            currentLines: lines,
            severity: lines > LARGE_FILE_LINES ? "warning" : "info",
        });
    }
    return findings.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}
