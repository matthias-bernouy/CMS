// Entry point bundled by `build.ts` → `src/assets/hub-components.js` (IIFE).
// Importing each module runs its self-registration (`customElements.define`).

// Layout / chrome
import "./HubPage/HubPage";
import "./HubSection/HubSection";
import "./HubGrid/HubGrid";
import "./HubTable/HubTable";
import "./HubStat/HubStat";
import "./HubCode/HubCode";
import "./HubHint/HubHint";
// Data / behaviour
import "./HubJson/HubJson";
import "./HubConfigForm/HubConfigForm";
import "./HubRouteParam/HubRouteParam";
import "./HubTenantIssuers/HubTenantIssuers";
import "./HubTenantConfigForm/HubTenantConfigForm";
import "./HubAddTenant/HubAddTenant";
import "./HubLogs/HubLogs";
import "./formGlue";
