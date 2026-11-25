import { ownedContainers } from "./containers";
import { upgradeDockerPath } from "./docker";
import { mkdtemp, mkdir, cp, chmod, open, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { resolveUlviaPaths } from "../../../../src/runtime/paths";
import { sourceStackRelease } from "../../../../src/runtime/stack/releases/local";
import { historicalSource, historicalVersion, workspace } from "./historical";
export async function upgradeFixture() {
    const root = await mkdtemp(join(workspace, "artifacts/upgrade-crash-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await cp(upgradeDockerPath, join(bin, "docker"));
    await chmod(join(bin, "docker"), 0o755);
    const ports = Array.from({ length: 2 }, () =>
        Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }),
    );
    const http = ports[0]!.port!,
        provider = ports[1]!.port!;
    for (const port of ports) {
        port.stop(true);
    }
    const targetVersion = process.env.ULVIA_SMOKE_IMAGE_VERSION ?? "0.1.0-verify";
    const environment = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ULVIA_UPGRADE_REAL_DOCKER: Bun.which("docker")!,
        ULVIA_DATA_DIR: join(root, "data"),
        ULVIA_CONFIG_DIR: join(root, "client"),
        ULVIA_HTTP_PORT: String(http),
        ULVIA_PROVIDER_PORT: String(provider),
        ULVIA_UPGRADE_LOCAL_PROVIDER: `docker.io/cyaxis/ulvia-provider:${targetVersion}`,
        ULVIA_UPGRADE_LOCAL_EDGE: `docker.io/cyaxis/ulvia-edge:${targetVersion}`,
    };
    const executables = new Map<string, string>();
    for (const [name, source, version] of [
        ["old", historicalSource, historicalVersion],
        ["new", workspace, targetVersion],
    ] as const) {
        const release = await sourceStackRelease(
            version,
            join(source, "packages/runtimes/ulvia-cli/src/runtime/stack/orchestration/definitions"),
        );
        const build = await Bun.build({
            entrypoints: [join(source, "packages/runtimes/ulvia-cli/src/index.ts")],
            outdir: join(root, name),
            target: "bun",
            packages: "bundle",
            external: ["css-tree", "playwright"],
            define: {
                __ULVIA_CLI_VERSION__: JSON.stringify(version),
                __ULVIA_DEFAULT_STACK_VERSION__: JSON.stringify(version),
                __ULVIA_STACK_RELEASE__: JSON.stringify(release),
            },
        });
        if (!build.success) {
            throw new AggregateError(build.logs, "Historical upgrade CLI build failed");
        }
        await mkdir(join(root, name, "node_modules"));
        await symlink(
            join(source, "packages/features/repository/node_modules/css-tree"),
            join(root, name, "node_modules/css-tree"),
        );
        await symlink(
            join(source, "packages/runtimes/ulvia-cli/node_modules/playwright"),
            join(root, name, "node_modules/playwright"),
        );
        executables.set(name, join(root, name, "index.js"));
    }
    let sequence = 0;
    const active = new Set<() => void>();
    const start = async (name: "old" | "new", args: string[], extra: Record<string, string> = {}) => {
        const output = await open(join(root, `cli-${sequence++}.log`), "w", 0o600);
        const child = Bun.spawn(["setsid", process.execPath, executables.get(name)!, ...args], {
            env: { ...environment, ...extra },
            stdout: output.fd,
            stderr: output.fd,
        });
        const kill = () => {
            try {
                process.kill(-child.pid, "SIGKILL");
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
                    throw error;
                }
            }
        };
        active.add(kill);
        const result = child.exited.then(async (code) => {
            active.delete(kill);
            await output.close();
            return code;
        });
        return {
            child,
            result,
            kill,
        };
    };
    const run = async (name: "old" | "new", args: string[], extra: Record<string, string> = {}) =>
        (await start(name, args, extra)).result;
    const paths = resolveUlviaPaths(environment);
    const runtime = ownedContainers(paths, environment.ULVIA_UPGRADE_REAL_DOCKER, targetVersion);
    return {
        root,
        paths,
        environment,
        targetVersion,
        origin: `http://control.localhost:${http}`,
        run,
        start,
        containers: runtime.list,
        assertImage: runtime.assert,
        async close() {
            for (const kill of active) {
                kill();
            }
            await Bun.sleep(100);
            await runtime.remove();
            // Retain logs and checkpoints as crash evidence; discard disposable live data only.
            await rm(paths.data, { recursive: true, force: true });
        },
    };
}
export type UpgradeFixture = Awaited<ReturnType<typeof upgradeFixture>>;
