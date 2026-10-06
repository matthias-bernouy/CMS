import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export async function materializeSourceBundle(
    tempDir: string,
    source: Readonly<Record<string, string>> | undefined,
): Promise<void> {
    await Promise.all(
        Object.entries(source ?? {}).map(async ([rawPath, content]) => {
            const destination = resolveSourceEntryPath(tempDir, rawPath);
            await mkdir(dirname(destination), { recursive: true });
            await Bun.write(destination, Buffer.from(content, "base64"));
        }),
    );
}

export function resolveSourceEntryPath(tempDir: string, rawPath: string): string {
    const path = rawPath.replace(/^\.\/+/, "");
    const segments = path.split("/");
    if (
        !path ||
        rawPath.includes("\\") ||
        rawPath.includes("\0") ||
        isAbsolute(rawPath) ||
        segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ) {
        throw new Error(`Invalid collection Bloc source path: ${rawPath}`);
    }
    return join(tempDir, ...segments);
}

export function assertValidJavaScriptArtifact(source: string, label: string): void {
    try {
        new Function(source);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Invalid generated JavaScript (${label}): ${detail}. ` +
                "Check the Bloc source and manifest metadata; the artifact was not persisted.",
        );
    }
}

export async function runBuild(
    options: Bun.BuildConfig,
    label: string,
    build: typeof Bun.build = Bun.build,
): Promise<string> {
    let result: Bun.BuildOutput;
    try {
        result = await build(options);
    } catch (error) {
        throw new Error(`Build failed (${label}):\n${formatError(error)}`);
    }
    if (!result.success || !result.outputs[0]) {
        throw new Error(`Build failed (${label}):\n${formatLogs(result.logs)}`);
    }
    return await result.outputs[0].text();
}

function formatLogs(logs: unknown[]): string {
    return !logs || logs.length === 0 ? "  (no details from Bun.build)" : logs.map(formatError).join("\n");
}

function formatError(error: unknown): string {
    if (error instanceof AggregateError) {
        return error.errors.map(formatError).join("\n");
    }
    const message = (error as { message?: unknown })?.message ?? String(error);
    const position = (error as { position?: { file?: string; line?: number; column?: number } })?.position;
    const where = position?.file ? `\n      at ${position.file}:${position.line ?? 0}:${position.column ?? 0}` : "";
    return `  - ${String(message)}${where}`;
}
