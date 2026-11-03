type Closeable = Readonly<{ close(): Promise<void> }>;
type Stoppable = Readonly<{ stop(): Promise<void> }>;

type InstanceResources = Readonly<{
    documentationTimer?: ReturnType<typeof setInterval>;
    recovery?: Stoppable;
    operations?: Stoppable;
    registry?: Closeable;
    documentation?: Closeable;
    diagnostics: Closeable;
    stores: Closeable;
}>;

/** Stop work before its dependencies; one failed disposer must not leak the other services. */
export async function closeInstanceComposition(resources: InstanceResources): Promise<void> {
    clearInterval(resources.documentationTimer);
    const errors: unknown[] = [];
    for (const dispose of [
        () => resources.recovery?.stop(),
        () => resources.operations?.stop(),
        () => resources.registry?.close(),
        () => resources.documentation?.close(),
        () => resources.diagnostics.close(),
        () => resources.stores.close(),
    ]) {
        try {
            await dispose();
        } catch (error) {
            errors.push(error);
        }
    }
    if (errors.length > 0) {
        throw new AggregateError(errors, "Provider instance resource disposal failed");
    }
}
