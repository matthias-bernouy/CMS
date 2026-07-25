import { CMS_SIGNUP_LEGAL_CONSENT_TAG, CmsSignupLegalConsent } from "./SignupLegalConsent";

if (!customElements.get(CMS_SIGNUP_LEGAL_CONSENT_TAG)) {
    customElements.define(CMS_SIGNUP_LEGAL_CONSENT_TAG, CmsSignupLegalConsent);
}
