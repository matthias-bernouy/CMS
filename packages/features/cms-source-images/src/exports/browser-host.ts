/** Host composition API. Bloc bundles consume the flag-bound functions from
 * `./browser`; they must not construct their own rollout policy. */
export {
    createResponsiveSourceImageBrowserApi,
    type ResponsiveSourceImageBrowserApi,
    type ResponsiveSourceImageRollout,
} from "../core/responsiveElement";
