/** Candidate builds stay local and use separate tags for acceptance and performance. */
export const browserBuildStep = { args: ["bun", "run", "--cwd", "packages/features/content", "build:browser"] };

export function candidateImageStep(version: string) {
    return { args: ["bun", "run", "infra/images/build.ts", "build", "--version", version] };
}

export function candidateEnvironment(version: string) {
    return {
        ULVIA_SMOKE_IMAGE_VERSION: version,
        ULVIA_MCP_EDGE_DOCKER_IMAGE: `docker.io/cyaxis/ulvia-edge:${version}`,
        ULVIA_MCP_PROVIDER_DOCKER_IMAGE: `docker.io/cyaxis/ulvia-provider:${version}`,
        ULVIA_TLS_TEST_IMAGE: `docker.io/cyaxis/ulvia-provider:${version}`,
    };
}
