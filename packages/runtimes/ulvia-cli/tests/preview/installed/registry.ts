import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function npmCommand(args: string[], cwd: string, root: string): Promise<string> {
    const child = Bun.spawn(["npm", ...args, "--ignore-scripts", "--no-audit", "--no-fund"], {
        cwd,
        env: {
            PATH: process.env.PATH,
            HOME: root,
            npm_config_userconfig: join(root, "empty-npmrc"),
            npm_config_globalconfig: join(root, "empty-global-npmrc"),
            npm_config_cache: join(root, "npm-cache"),
            npm_config_update_notifier: "false",
        },
        stdout: "pipe",
        stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (code) {
        throw new Error(`npm ${args[0]} failed (${code}): ${stderr}`);
    }
    return stdout;
}

/** Serve exact installed dependency bytes locally; npm cannot depend on a warm cache or the public registry. */
export async function dependencyRegistry(root: string) {
    const directory = join(root, "dependencies");
    await mkdir(directory);
    const packages = new Map<string, { manifest: Record<string, any>; bytes: Uint8Array }>();
    const load = async (manifestPath: string): Promise<void> => {
        const manifest = await Bun.file(manifestPath).json();
        if (packages.has(manifest.name)) {
            return;
        }
        const packed = JSON.parse(await npmCommand(["pack", dirname(manifestPath), "--json"], directory, root));
        const bytes = new Uint8Array(await Bun.file(join(directory, packed[0].filename)).arrayBuffer());
        packages.set(manifest.name, { manifest, bytes });
        for (const dependency of Object.keys(manifest.dependencies ?? {})) {
            await load(createRequire(manifestPath).resolve(`${dependency}/package.json`));
        }
    };
    const require = createRequire(resolve("packages/features/repository/package.json"));
    for (const name of ["css-tree", "playwright"]) {
        await load(require.resolve(`${name}/package.json`));
    }
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            const path = decodeURIComponent(new URL(request.url).pathname.slice(1));
            const tarball = path.startsWith("tarballs/");
            const value = packages.get(tarball ? path.slice("tarballs/".length) : path);
            if (!value) {
                return new Response(null, { status: 404 });
            }
            if (tarball) {
                return new Response(value.bytes, { headers: { "content-type": "application/octet-stream" } });
            }
            const { manifest, bytes } = value;
            return Response.json({
                name: manifest.name,
                "dist-tags": { latest: manifest.version },
                versions: {
                    [manifest.version]: {
                        ...manifest,
                        dist: {
                            tarball: new URL(`tarballs/${manifest.name}`, request.url).href,
                            integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
                        },
                    },
                },
            });
        },
    });
    return {
        url: server.url.href,
        dependencies: Object.fromEntries(
            ["css-tree", "playwright"].map((name) => [name, packages.get(name)!.manifest.version]),
        ),
        stop: () => server.stop(true),
    };
}
