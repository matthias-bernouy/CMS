// Private code-owned metadata distinguishes default terminal executors from complete alternative handlers.
const modes = new WeakMap<object, "sync" | "operation">();
export function defaultHandlerFactory<Dependencies>(
    factory: (dependencies: Dependencies) => unknown,
    execution: "sync" | "operation",
) {
    modes.set(factory, execution);
    return factory;
}
export function factoryExecution(factory: object) {
    return modes.get(factory);
}
