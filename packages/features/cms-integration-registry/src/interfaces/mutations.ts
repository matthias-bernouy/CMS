export interface IntegrationRegistryMutationCoordinator {
    runExclusive<T>(kind: string, operation: () => Promise<T>): Promise<T>;
}
