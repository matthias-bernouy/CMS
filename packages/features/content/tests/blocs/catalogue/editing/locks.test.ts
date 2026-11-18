import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";

test("nested in-memory reference writes complete or refuse promptly instead of deadlocking the queue", async () => {
    const repository = new InMemoryContentRepository();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
        repository
            .withContentReferenceWrite(() => repository.withContentReferenceWrite(async () => "completed"))
            .then(
                () => "completed",
                () => "refused",
            ),
        new Promise<string>((resolve) => {
            timer = setTimeout(() => resolve("deadlocked"), 500);
        }),
    ]).finally(() => clearTimeout(timer));
    expect(outcome).not.toBe("deadlocked");
    await repository.withContentReferenceWrite(async () => "next writer");
});
