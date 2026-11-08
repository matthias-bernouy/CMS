// Private runtime metadata binds a default handler's guard to the same captured services.
const authorizations = new WeakMap<object, unknown>();

export function authorizeHandler<Arguments extends unknown[], Result>(
    handler: (...args: Arguments) => Result,
    authorize: (...args: Arguments) => unknown,
): typeof handler {
    authorizations.set(handler, authorize);
    return handler;
}

export function handlerAuthorization<Arguments extends unknown[]>(handler: (...args: Arguments) => unknown) {
    return authorizations.get(handler) as ((...args: Arguments) => unknown) | undefined;
}
