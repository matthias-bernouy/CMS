import { validateCaptureOptions } from "@bernouy/browser-capture";
import type { ContentServices } from "content/application/interfaces/ContentServices";
import type { ContentCapabilityContext } from "content/application/interfaces/ContentCapabilityContext";
import type { ExampleCaptureInput, PageCaptureInput } from "./schemas";
import { ContentCapabilityError } from "content/application/core/capabilities/errors";
import { createCapture, captureOwner, captureLocale } from "./create";
async function preparePageCapture(
    services: ContentServices,
    input: PageCaptureInput,
    context: ContentCapabilityContext,
) {
    captureOwner(context);
    validateCaptureOptions(input.options);
    input = { ...input, locale: captureLocale(input.locale) };
    const captures = services.captures;
    if (!captures) {
        throw new ContentCapabilityError("CORE_UNAVAILABLE");
    }
    const revision = await captures.revision();
    const page = await services.repo.getPageById(input.id);
    if (!page) {
        throw new ContentCapabilityError("NOT_FOUND");
    }
    if (page.revision !== input.expectedRevision) {
        throw new ContentCapabilityError("REVISION_CONFLICT");
    }
    const document = await captures.pageDocument(page, input, context);
    const current = await services.repo.getPageById(input.id);
    if (current?.revision !== page.revision || (await captures.revision()) !== revision) {
        throw new ContentCapabilityError("REVISION_CONFLICT");
    }
    return createCapture(
        captures,
        document,
        input.options,
        { kind: "page", id: page.id, revision: `${page.revision}:${revision}`, dependencies: [] },
        input.locale,
        context,
    );
}
async function prepareExampleCapture(
    services: ContentServices,
    input: ExampleCaptureInput,
    context: ContentCapabilityContext,
) {
    captureOwner(context);
    input = { ...input, locale: captureLocale(input.locale) };
    if (!services.captures) {
        throw new ContentCapabilityError("CORE_UNAVAILABLE");
    }
    const result = await services.captures.exampleDocument(input, context);
    return createCapture(
        services.captures,
        result.document,
        { width: result.width, height: result.height, mode: "viewport", themeMode: input.themeMode },
        result.source,
        input.locale,
        context,
    );
}
export function captureImage(
    services: Pick<ContentServices, "captures">,
    captureId: string,
    context: ContentCapabilityContext,
) {
    const owner = captureOwner(context);
    if (!services.captures) {
        throw new ContentCapabilityError("CORE_UNAVAILABLE");
    }
    const bytes = services.captures.artifacts.get(owner, captureId);
    if (!bytes) {
        throw new ContentCapabilityError("NOT_FOUND");
    }
    return new Response(new Uint8Array(bytes), {
        headers: { "content-type": "image/png", "cache-control": "private, no-store" },
    });
}

export async function capturePage(
    services: ContentServices,
    input: PageCaptureInput,
    context: ContentCapabilityContext,
) {
    captureOwner(context);
    if (!services.captures) {
        throw new ContentCapabilityError("CORE_UNAVAILABLE");
    }
    return services.captures.run(() => preparePageCapture(services, input, context));
}
export async function captureExample(
    services: ContentServices,
    input: ExampleCaptureInput,
    context: ContentCapabilityContext,
) {
    captureOwner(context);
    if (!services.captures) {
        throw new ContentCapabilityError("CORE_UNAVAILABLE");
    }
    return services.captures.run(() => prepareExampleCapture(services, input, context));
}
