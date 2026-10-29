import { assertCandidateImage } from "./images";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "../../..");
const variables = [
    "ULVIA_MCP_EDGE_DOCKER_IMAGE",
    "ULVIA_MCP_PROVIDER_DOCKER_IMAGE",
    "ULVIA_REPOSITORY_DOCKER_IMAGE",
] as const;
const supplied = variables.filter((key) => process.env[key]);
if (supplied.length !== 0 && supplied.length !== 3) {
    throw new Error("Supply all three delivery performance images, or none to build the candidate locally");
}
const env: Record<string, string | undefined> = { ...process.env, ULVIA_RUN_DELIVERY_PERFORMANCE: "1" };
async function run(args: string[]) {
    const child = Bun.spawn([process.execPath, ...args], { cwd: root, env, stdout: "inherit", stderr: "inherit" });
    if (await child.exited) {
        throw new Error(`Failed: ${args.join(" ")}`);
    }
}
if (!supplied.length) {
    const version = "0.1.0-guardrails";
    await run(["run", "infra/images/build.ts", "build", "--version", version, "all"]);
    env.ULVIA_MCP_EDGE_DOCKER_IMAGE = `docker.io/cyaxis/ulvia-edge:${version}`;
    env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE = `docker.io/cyaxis/ulvia-provider:${version}`;
    env.ULVIA_REPOSITORY_DOCKER_IMAGE = `docker.io/cyaxis/ulvia-official-repository:${version}`;
}
const git = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
const revision = (await new Response(git.stdout).text()).trim();
if (await git.exited) {
    throw new Error("Cannot identify candidate revision");
}
for (const [index, component] of ["edge", "provider", "repository"].entries()) {
    const inspect = Bun.spawn(["docker", "image", "inspect", env[variables[index]!]!], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [code, metadata, error] = await Promise.all([
        inspect.exited,
        new Response(inspect.stdout).text(),
        new Response(inspect.stderr).text(),
    ]);
    if (code) {
        throw new Error(`Cannot inspect candidate image: ${error}`);
    }
    assertCandidateImage(JSON.parse(metadata), component, revision);
}
await run(["test", "./tests/integration/instance/performance.docker.test.ts"]);
