import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("compiles through linked temporary paths without changing artifacts or allowing outside imports", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "cms-build-temp-path-")));
    const physical = join(root, "physical temporary directory");
    const linked = join(root, "linked temporary directory");
    const outside = join(root, "outside.ts");
    try {
        await mkdir(physical);
        await symlink(physical, linked, process.platform === "win32" ? "junction" : "dir");
        await writeFile(outside, 'export const marker = "OUTSIDE_BUNDLE";');
        const source = `
import { buildCollectionBloc } from "@bernouy/repository/collections/build";
const artifact = await buildCollectionBloc({
    tag: "example--demo--temp-path",
    viewSource: 'import { marker } from "./marker"; export function mount(root) { root.dataset.marker = marker; }',
    source: { "marker.ts": Buffer.from('export const marker = "TEMP_PATH_MARKER";').toString("base64") },
});
let denied = false;
try {
    await buildCollectionBloc({
        tag: "example--demo--outside-temp",
        viewSource: ${JSON.stringify(`import { marker } from ${JSON.stringify(outside)}; export function mount() { return marker; }`)},
    });
} catch (error) {
    denied = String(error).includes("Bloc import escapes its source bundle");
}
console.log(JSON.stringify({ ...artifact, denied }));
`;
        const compile = async (temporary: string) => {
            const child = Bun.spawn([process.execPath, "--no-macros", "-e", source], {
                cwd: resolve(import.meta.dir, "../../../.."),
                env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
                stdout: "pipe",
                stderr: "pipe",
            });
            const [code, output, errors] = await Promise.all([
                child.exited,
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
            ]);
            expect(code, errors).toBe(0);
            return JSON.parse(output) as { browserAbi: string; viewJS: string; denied: boolean };
        };
        const canonical = await compile(physical);
        const aliased = await compile(linked);
        expect(aliased).toEqual(canonical);
        expect(aliased.browserAbi).toBe("v1");
        expect(aliased.viewJS).toContain("TEMP_PATH_MARKER");
        expect(aliased.denied).toBe(true);
        expect(await readdir(physical)).toEqual([]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
