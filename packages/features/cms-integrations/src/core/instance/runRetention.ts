export const MAX_INTEGRATION_RUNS = 20;

export function trimIntegrationRuns<T>(runs: T[]): T[] {
    return runs.slice(Math.max(0, runs.length - MAX_INTEGRATION_RUNS));
}
