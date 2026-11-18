import { ClientFailure } from "../../../../../harness/clients/failure";

/** Keep explicit fixture phases and safe client codes, excluding remote messages, DTOs and credentials. */
export async function collectionFixtureStage<T>(stage: string, task: () => Promise<T>): Promise<T> {
    try {
        return await task();
    } catch (error) {
        throw new ClientFailure(
            `collection-fixture-${stage}-${error instanceof ClientFailure ? error.code : "internal"}`,
        );
    }
}
