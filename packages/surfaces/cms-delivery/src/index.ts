/**
 * @bernouy/cms-delivery — public rendering layer of the CMS.
 *
 * `DeliveryCms` mounts page resolution, bloc bundles, theme CSS, the
 * component runtime, and the default favicon under whatever runner the
 * consumer provides. Reads from a `DeliveryRepository` (the read-only
 * subset of `CmsRepository`); a `MongoCmsRepository` / `InMemoryCmsRepository`
 * from `@bernouy/cms-shared` satisfies it by structural typing.
 *
 * Pure on-demand rendering — no Playwright, no build-time pre-rendering.
 */

export { default as DeliveryCms }      from "cms-delivery/DeliveryCms";
export type { DeliveryCmsConfig }      from "cms-delivery/DeliveryCms";
export type { DeliveryRepository }     from "cms-delivery/interfaces/DeliveryRepository";
export type { HeadInjector, HeadInjectorContext } from "cms-delivery/interfaces/HeadInjector";
