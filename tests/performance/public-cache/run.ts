import { resolve } from "node:path";
import { cacheOptions } from "./plan";
import { executeWorkspace } from "../../../infra/workspace";
import { browserBuildStep, candidateImageStep, candidateEnvironment } from "../../../infra/images/candidate";
import { assertCandidateImage } from "../delivery/images";

export async function publicCacheCommand(args: readonly string[]) {
    const options = cacheOptions(args);
    if (options.list) {
        console.log(options.scenarios.join("\n"));
        return;
    }
    const variables = ["ULVIA_MCP_EDGE_DOCKER_IMAGE", "ULVIA_MCP_PROVIDER_DOCKER_IMAGE"] as const;
    const supplied = variables.filter((key) => process.env[key]);
    if (supplied.length !== 0 && supplied.length !== 2) {
        throw new Error("Supply both candidate images, or neither");
    }
    let environment: Record<string, string | undefined> = { ...process.env };
    if (!supplied.length) {
        const version = "0.1.0-public-cache";
        await executeWorkspace([
            { args: ["bun", "run", "infra/bootstrap.ts"] },
            browserBuildStep,
            candidateImageStep(version),
        ]);
        environment = { ...environment, ...candidateEnvironment(version) };
    }
    const root = resolve(import.meta.dir, "../../..");
    const git = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const revision = (await new Response(git.stdout).text()).trim();
    if (await git.exited) {
        throw new Error("Cannot identify candidate revision");
    }
    for (const [index, component] of ["edge", "provider"].entries()) {
        const child = Bun.spawn(["docker", "image", "inspect", environment[variables[index]!]!], {
            stdout: "pipe",
            stderr: "pipe",
        });
        const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
        if (code) {
            throw new Error(`Cannot inspect candidate ${component} image`);
        }
        assertCandidateImage(JSON.parse(output), component, revision);
    }
    await executeWorkspace([
        {
            args: ["bun", "test", "./tests/performance/public-cache/scenarios/journey.docker.test.ts"],
            env: {
                ...environment,
                ULVIA_RUN_PUBLIC_CACHE_PERFORMANCE: "1",
                ULVIA_PUBLIC_CACHE_OPTIONS: JSON.stringify(options),
            },
        },
    ]);
}
if (import.meta.main) {
    await publicCacheCommand(Bun.argv.slice(2));
}
