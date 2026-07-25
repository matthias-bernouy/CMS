/**
 * Browser-side custom elements ship under this subpath so consumers can pull
 * them into their browser bundle WITHOUT dragging the Node-side modules (jose,
 * mongodb, node:crypto, …) the main barrel re-exports.
 *
 * Usage in a host's `components/index.ts`:
 *
 *     import "@bernouy/cms-auth/components";
 *
 * Side-effect imports — each module calls `customElements.define()`.
 */
import "./LoginMethods/LoginMethods";
import "./SignupLegalConsent/register";
export {
    CMS_SIGNUP_LEGAL_CONSENT_TAG,
    CmsSignupLegalConsent,
} from "./SignupLegalConsent/SignupLegalConsent";
