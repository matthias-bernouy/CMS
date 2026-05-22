(()=>{class d extends HTMLElement{constructor(t){super();let e=this.attachShadow({mode:"open"});if(t){let r=document.createElement("style");r.textContent=t.css,e.appendChild(r);let i=document.createElement("template");i.innerHTML=t.template,e.appendChild(i.content.cloneNode(!0))}}connectedCallback(){}}var p=`:host { display: block; padding: 1.75rem 2rem; max-width: 1280px; }

[part="header"] {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.main { min-width: 0; }
.actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

slot[name="title"]::slotted(h1) {
    margin: 0;
    font-size: 1.65rem;
    color: var(--text-main);
    line-height: 1.2;
}
slot[name="title"]::slotted(p) {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
}
`;class g extends d{constructor(){super({css:p,template:`
                <header part="header">
                    <div class="main"><slot name="title"></slot></div>
                    <div class="actions"><slot name="actions"></slot></div>
                </header>
                <div part="body"><slot></slot></div>`})}}if(!customElements.get("hub-page"))customElements.define("hub-page",g);var A=`:host { display: block; margin-bottom: 2rem; }

[part="title"] {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    color: var(--text-main);
}
[part="title"][hidden] { display: none; }
`;class k extends d{static get observedAttributes(){return["label"]}constructor(){super({css:A,template:'<h2 part="title" hidden></h2><div part="body"><slot></slot></div>'})}connectedCallback(){this._sync()}attributeChangedCallback(){this._sync()}_sync(){let t=this.shadowRoot?.querySelector("[part='title']");if(!t)return;let e=this.getAttribute("label")??"";t.textContent=e,t.hidden=e===""}}if(!customElements.get("hub-section"))customElements.define("hub-section",k);var E=`:host { display: block; }

[part="grid"] {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
}

/* The <w13c-fetch> host stamps its cards as siblings — keep it out of the
 * grid flow so it doesn't claim a cell. */
[part="grid"] ::slotted(w13c-fetch) { display: contents; }

[part="empty"] { margin-top: 0.5rem; }
[part="empty"][hidden] { display: none; }
`;class b extends d{constructor(){super({css:E,template:`
                <div part="grid"><slot></slot></div>
                <div part="empty"><slot name="empty"></slot></div>`})}connectedCallback(){let t=this.shadowRoot.querySelector("slot:not([name])");t.addEventListener("slotchange",()=>this._sync(t)),this._sync(t)}_sync(t){let e=t.assignedElements().filter((r)=>r.tagName!=="W13C-FETCH"&&r.tagName!=="TEMPLATE").length;this.shadowRoot.querySelector("[part='empty']").hidden=e>0}}if(!customElements.get("hub-grid"))customElements.define("hub-grid",b);var h=`:host { display: block; }

[part="empty"] { margin-top: 1rem; }
[part="empty"][hidden] { display: none; }
`;class w extends d{_observer=null;constructor(){super({css:h,template:`
                <p9r-table>
                    <slot name="header" slot="header"></slot>
                    <slot></slot>
                </p9r-table>
                <div part="empty"><slot name="empty"></slot></div>`})}connectedCallback(){this._observer=new MutationObserver(()=>this._sync()),this._observer.observe(this,{childList:!0,subtree:!0}),this._sync()}disconnectedCallback(){this._observer?.disconnect()}_sync(){let t=this.querySelectorAll("p9r-row:not([slot])").length;this.shadowRoot.querySelector("[part='empty']").hidden=t>0}}if(!customElements.get("hub-table"))customElements.define("hub-table",w);var M=`:host { display: block; }

[part="tile"] {
    display: block;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 120ms, transform 120ms;
}
a[part="tile"][href]:hover {
    border-color: var(--primary-base);
    transform: translateY(-1px);
}

.label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}
.value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
    margin-top: 0.25rem;
    color: var(--text-main);
}
.sub {
    display: block;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
}
.sub[hidden] { display: none; }
`;class z extends d{static get observedAttributes(){return["label","sub","href"]}constructor(){super({css:M,template:`
                <a part="tile">
                    <span class="label"></span>
                    <span class="value"><slot></slot></span>
                    <span class="sub"></span>
                </a>`})}connectedCallback(){this._sync()}attributeChangedCallback(){this._sync()}_sync(){let t=this.shadowRoot;if(!t)return;let e=t.querySelector("a"),r=this.getAttribute("href");if(r)e.setAttribute("href",r);else e.removeAttribute("href");t.querySelector(".label").textContent=this.getAttribute("label")??"";let i=t.querySelector(".sub");i.textContent=this.getAttribute("sub")??"",i.hidden=!this.getAttribute("sub")}}if(!customElements.get("hub-stat"))customElements.define("hub-stat",z);var L=`:host { display: inline; }

code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    background: var(--bg-base);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border-default);
    color: var(--text-body);
}

:host([block]) { display: block; }
:host([block]) code {
    display: block;
    padding: 0.75rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
}
`;class v extends d{constructor(){super({css:L,template:'<code part="code"><slot></slot></code>'})}}if(!customElements.get("hub-code"))customElements.define("hub-code",v);var R=`:host {
    display: block;
    margin: 0 0 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.45;
}
`;class B extends d{constructor(){super({css:R,template:"<slot></slot>"})}}if(!customElements.get("hub-hint"))customElements.define("hub-hint",B);var it=new Set(["active","enabled","ok","up"]);class $ extends d{connectedCallback(){let t=(this.getAttribute("value")??"").trim(),e=it.has(t.toLowerCase())?"success":"danger",r=document.createElement("p9r-badge");r.setAttribute("color",e),r.setAttribute("dot",""),r.textContent=t||"unknown",this.shadowRoot.replaceChildren(r)}}if(!customElements.get("hub-status"))customElements.define("hub-status",$);class U extends d{connectedCallback(){let t=this.getAttribute("value")??"",e=this.getAttribute("kind")??"",r;if(e==="url"&&/^https?:\/\//i.test(t)){let i=document.createElement("a");i.href=t,i.textContent=t,i.target="_blank",i.rel="noopener noreferrer",r=i}else if(e==="code"){let i=document.createElement("hub-code");i.textContent=t,r=i}else r=document.createTextNode(t);this.shadowRoot.replaceChildren(r)}}if(!customElements.get("hub-field"))customElements.define("hub-field",U);var W=`<pre part="code"></pre>
`;var S=`:host {
    display: block;
}

pre {
    margin: 0;
    overflow: auto;
    max-height: 28rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    background: var(--bg-base);
    border: 1px solid var(--border-default);
    color: var(--text-body);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    tab-size: 2;
}
`;function f(t){return new URLSearchParams(window.location.search).get(t)||""}async function m(t){try{let e=await fetch(t,{headers:{Accept:"application/json"}});if(!e.ok)return null;return(await e.json())?.data??null}catch{return null}}async function s(t,e,r){try{let i=await fetch(e,{method:t,headers:{"Content-Type":"application/json",Accept:"application/json"},...r!==void 0?{body:JSON.stringify(r)}:{}});if(i.ok)return{ok:!0};let o=`HTTP ${i.status}`;try{let n=await i.json();if(n?.error?.message)o=n.error.message}catch{}return{ok:!1,message:o}}catch(i){return{ok:!1,message:i instanceof Error?i.message:String(i)}}}class X extends d{_value=void 0;static get observedAttributes(){return["value","src","path"]}constructor(){super({css:S,template:W})}connectedCallback(){this._init()}attributeChangedCallback(){if(this.isConnected)this._init()}get value(){return this._value}set value(t){this._value=t,this._render()}async _init(){let t=this.getAttribute("src");if(t){let e=this.shadowRoot?.querySelector("pre");if(e)e.textContent="Loading…";let r=this._withPageQuery(t),i=await m(r);this._value=this._resolvePath(i,this.getAttribute("path"))}this._render()}_withPageQuery(t){let e=new URLSearchParams(window.location.search);if([...e].length===0)return t;let[r,i=""]=t.split("?"),o=new URLSearchParams(i);for(let[n,l]of e)if(!o.has(n))o.set(n,l);return`${r}?${o.toString()}`}_resolvePath(t,e){if(!e)return t;return e.split(".").reduce((r,i)=>r==null?r:r[i],t)}_resolve(){if(this._value!==void 0)return this._value;let r=(this.getAttribute("value")??this.textContent??"").trim();if(!r)return null;try{return JSON.parse(r)}catch{return r}}_render(){let t=this.shadowRoot?.querySelector("pre");if(!t)return;let e=this._resolve();t.textContent=typeof e==="string"?e:JSON.stringify(e,null,2)}}if(!customElements.get("hub-json"))customElements.define("hub-json",X);var Y=`:host {
    display: block;
}

[part="form"] {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
}

.group {
    margin: 0.75rem 0 0;
    font-size: 0.95rem;
    color: var(--text-main);
    border-bottom: 1px solid var(--border-light, var(--border-default));
    padding-bottom: 0.25rem;
}

textarea {
    width: 100%;
    min-height: 5rem;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-body);
    font: inherit;
    resize: vertical;
}

select[multiple] {
    width: 100%;
    padding: 0.4rem;
    border-radius: 6px;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-body);
}
`;function K(t){let e=t["x-widget"];if(typeof e==="string")return e;if(t.writeOnly)return"password";if(t.type==="boolean")return"toggle";if(t.type==="integer"||t.type==="number")return"number";if(t.type==="string"&&Array.isArray(t.enum))return"select";if(t.type==="string"&&t.format==="date")return"date";if(t.type==="string")return"text";if(t.type==="array"&&t.items&&Array.isArray(t.items.enum))return"select-multiple";if(t.type==="array")return"tags";return"text"}function Q(t,e,r){let i=t["x-writable-by"],o=Array.isArray(e.defaultWritableBy)?e.defaultWritableBy:["control-plane","tenant"];return(Array.isArray(i)?i:o).includes(r)}function Z(t,e,r,i,o){let n,l=r===void 0||r===null?"":String(r);switch(i){case"toggle":if(n=document.createElement("p9r-switch"),n.setAttribute("name",t),r===!0||r==="true")n.setAttribute("checked","");break;case"select":n=document.createElement("p9r-select"),n.setAttribute("name",t);for(let a of e.enum){let c=document.createElement("option");if(c.value=String(a),c.textContent=String(a),String(a)===l)c.selected=!0;n.appendChild(c)}break;case"select-multiple":{n=document.createElement("select"),n.setAttribute("multiple",""),n.setAttribute("name",t);let a=Array.isArray(r)?r:[];for(let c of e.items.enum){let u=document.createElement("option");if(u.value=String(c),u.textContent=String(c),a.includes(c))u.selected=!0;n.appendChild(u)}break}case"number":case"slider":if(n=document.createElement("p9r-input"),n.setAttribute("type","number"),n.setAttribute("name",t),n.setAttribute("value",l),e.minimum!==void 0)n.setAttribute("min",String(e.minimum));if(e.maximum!==void 0)n.setAttribute("max",String(e.maximum));break;case"password":if(n=document.createElement("p9r-input"),n.setAttribute("type","password"),n.setAttribute("name",t),!e.writeOnly)n.setAttribute("value",l);break;case"date":n=document.createElement("p9r-input"),n.setAttribute("type","date"),n.setAttribute("name",t),n.setAttribute("value",l);break;case"textarea":n=document.createElement("textarea"),n.setAttribute("name",t),n.value=l;break;case"tags":n=document.createElement("p9r-input"),n.setAttribute("type","text"),n.setAttribute("name",t),n.setAttribute("placeholder","comma-separated values"),n.setAttribute("value",Array.isArray(r)?r.join(", "):l),n.dataset.tags="1";break;default:n=document.createElement("p9r-input"),n.setAttribute("type","text"),n.setAttribute("name",t),n.setAttribute("value",l)}if(!o)n.setAttribute("disabled","");if(e.title)n.setAttribute("label",e.title);if(e.description)n.setAttribute("hint",e.description);return n}function D(t,e,r){if(r==="toggle")return Boolean(t.hasAttribute("checked")||t.checked);if(r==="select-multiple"){let o=[];for(let n of t.options)if(n.selected)o.push(n.value);return o}if(r==="tags"){let o=(t.value||t.getAttribute("value")||"").trim();return o?o.split(",").map((n)=>n.trim()).filter(Boolean):[]}if(r==="number"||r==="slider"){let o=t.value!==void 0?t.value:t.getAttribute("value");if(o===""||o===null||o===void 0)return;let n=Number(o);return e.type==="integer"?Math.trunc(n):n}if(r==="password"&&e.writeOnly){let o=t.value!==void 0?t.value:t.getAttribute("value");return o?o:void 0}let i=t.value!==void 0?t.value:t.getAttribute("value");return i===""||i===null||i===void 0?void 0:i}class P extends d{_schema=null;_value={};_fields=[];constructor(){super({css:Y,template:"<div part='form'></div>"})}connectedCallback(){this._schema=this._parse("schema"),this._value=this._parse("value")??{},this.rebuild()}get mode(){return this.getAttribute("mode")||"tenant"}get _prefix(){return this.getAttribute("prefix")||""}_parse(t){let e=this.getAttribute(t);if(!e)return null;try{return JSON.parse(e)}catch{return null}}get _root(){return this.shadowRoot.querySelector("[part='form']")}rebuild(){let t=this._root;if(t.innerHTML="",this._fields=[],!this._schema||typeof this._schema!=="object")return;let e=this._schema.properties||{},r=new Set(this._schema.required||[]),i=new Map;for(let[o,n]of Object.entries(e)){if(n.writeOnly&&this.mode==="tenant")continue;let l=Q(n,this._schema,this.mode),a=K(n),c=this._prefix?`${this._prefix}.${o}`:o,u=this._value[o]!==void 0?this._value[o]:n.default,x=Z(c,n,u,a,l);if(x.dataset.fieldName=o,r.has(o))x.setAttribute("required","");x.addEventListener("change",()=>this._emitChange()),x.addEventListener("input",()=>this._emitChange()),this._fields.push({name:o,prop:n,el:x,widget:a});let y=n["x-group"]||"default";(i.get(y)??i.set(y,[]).get(y)).push(x)}for(let[o,n]of i){if(o!=="default"){let l=document.createElement("h4");l.className="group",l.textContent=o,t.appendChild(l)}for(let l of n)t.appendChild(l)}}_emitChange(){this.dispatchEvent(new CustomEvent("hub-config-change",{detail:{values:this.getValues(),valid:this.isValid()},bubbles:!0,composed:!0}))}getValues(){let t={};for(let{name:e,prop:r,el:i,widget:o}of this._fields){let n=D(i,r,o);if(n!==void 0)t[e]=n}return t}isValid(){let t=this.getValues();for(let e of new Set(this._schema?.required||[])){let r=t[e];if(r===void 0||r===null||r==="")return!1;if(Array.isArray(r)&&r.length===0)return!1}return!0}}if(!customElements.get("hub-config-form"))customElements.define("hub-config-form",P);class V extends HTMLElement{connectedCallback(){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>this._apply(),{once:!0});else this._apply()}_apply(){let t=this.getAttribute("param");if(!t)return;let e=new URLSearchParams(window.location.search).get(t)??"",r=encodeURIComponent(e),i=`__${t.toUpperCase()}__`,o=this.getAttribute("target");if(o)document.querySelectorAll(o).forEach((n)=>{n.textContent=e});for(let n of Array.from(document.body.querySelectorAll("*")))for(let l of["href","target","url"]){let a=n.getAttribute(l);if(a&&a.includes(i))n.setAttribute(l,a.replaceAll(i,r))}}}if(!customElements.get("hub-route-param"))customElements.define("hub-route-param",V);var O=`:host { display: block; }

[part="root"] { display: flex; flex-direction: column; gap: 0.75rem; }

.list { display: flex; flex-direction: column; gap: 0.5rem; }

.row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: end;
}

.actions { display: flex; gap: 0.5rem; }

.msg:empty { display: none; }
`;class T extends d{_issuers=[];constructor(){super({css:O,template:"<div part='root'></div>"})}connectedCallback(){this._load()}get _tenantId(){return this.getAttribute("tenant-id")||f("tenantId")}get _root(){return this.shadowRoot.querySelector("[part='root']")}async _load(){let t=await m(`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`);this._issuers=t?.issuers?[...t.issuers]:[],this._render()}_render(){let t=this._root;t.innerHTML="";let e=document.createElement("div");e.className="list",this._issuers.forEach((l,a)=>e.appendChild(this._row(l,a))),t.appendChild(e);let r=document.createElement("div");r.className="actions";let i=document.createElement("p9r-button");i.setAttribute("variant","ghost"),i.textContent="+ Add an issuer",i.addEventListener("click",()=>{this._issuers.push(""),this._render()});let o=document.createElement("p9r-button");o.setAttribute("color","primary"),o.textContent="Save trust-list",o.addEventListener("click",()=>void this._save()),r.append(i,o),t.appendChild(r);let n=document.createElement("div");n.className="msg",t.appendChild(n)}_row(t,e){let r=document.createElement("div");r.className="row";let i=document.createElement("p9r-input");i.setAttribute("label",`Issuer ${e+1}`),i.setAttribute("placeholder","https://keycloak.example/realms/acme"),i.setAttribute("value",t),i.addEventListener("input",()=>{this._issuers[e]=i.value??i.getAttribute("value")??""});let o=document.createElement("p9r-button");return o.setAttribute("variant","ghost"),o.setAttribute("color","danger"),o.textContent="✕",o.addEventListener("click",()=>{this._issuers.splice(e,1),this._render()}),r.append(i,o),r}async _save(){let t=this.shadowRoot.querySelector(".msg");t.innerHTML="";let e=this._issuers.map((o)=>o.trim()).filter(Boolean),r=await s("PATCH",`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`,{issuers:e}),i=document.createElement("p9r-alert");if(r.ok)i.setAttribute("type","success"),i.textContent="Trust-list saved.",this._issuers=e,document.dispatchEvent(new CustomEvent("tenant:updated",{bubbles:!0}));else i.setAttribute("type","error"),i.textContent=`Failed: ${r.message}`;t.appendChild(i)}}if(!customElements.get("hub-tenant-issuers"))customElements.define("hub-tenant-issuers",T);var j=`:host { display: block; }

form { display: flex; flex-direction: column; gap: 1rem; align-items: flex-start; }

.msg:empty { display: none; }
`;class F extends d{constructor(){super({css:j,template:"<div part='root'></div>"})}connectedCallback(){this._load()}get _tenantId(){return this.getAttribute("tenant-id")||f("tenantId")}get _root(){return this.shadowRoot.querySelector("[part='root']")}_info(t,e){let r=document.createElement("p9r-alert");if(t)r.setAttribute("type",t);r.textContent=e,this._root.replaceChildren(r)}async _load(){this._root.textContent="Loading…";let t=this._tenantId,e=await m(`/api/namespaces/tenants?tenantId=${encodeURIComponent(t)}`);if(!e){this._info("error","Unknown tenant.");return}let i=(await m(`/api/providers?providerId=${encodeURIComponent(e.providerId)}`))?.schemas?.tenantConfig??null;if(!i){this._info("","This data-provider declares no tenantConfig — nothing to edit here.");return}let o=await m(`/api/namespaces/tenants/config?tenantId=${encodeURIComponent(t)}`);this._renderForm(i,o?.config??{})}_renderForm(t,e){this._root.innerHTML="";let r=document.createElement("form"),i=document.createElement("hub-config-form");i.setAttribute("mode","control-plane"),i.setAttribute("prefix","providerConfig"),i.setAttribute("schema",JSON.stringify(t)),i.setAttribute("value",JSON.stringify(e)),r.appendChild(i);let o=document.createElement("p9r-button");o.setAttribute("color","primary"),o.setAttribute("type","submit"),o.textContent="Save config",r.appendChild(o);let n=document.createElement("div");n.className="msg",r.appendChild(n),r.addEventListener("submit",async(l)=>{l.preventDefault(),n.innerHTML="";let a=await s("PATCH",`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`,{providerConfig:i.getValues()}),c=document.createElement("p9r-alert");if(a.ok)c.setAttribute("type","success"),c.textContent="Config saved.",document.dispatchEvent(new CustomEvent("tenant:updated",{bubbles:!0}));else c.setAttribute("type","error"),c.textContent=`Failed: ${a.message}`;n.appendChild(c)}),this._root.appendChild(r)}}if(!customElements.get("hub-tenant-config-form"))customElements.define("hub-tenant-config-form",F);var q=`:host { display: block; }

[part="root"] {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.msg:empty { display: none; }
`;class J extends d{constructor(){super({css:q,template:"<div part='root'></div>"})}connectedCallback(){this._render()}get _namespaceId(){return this.getAttribute("namespace-id")||f("namespaceId")}get _root(){return this.shadowRoot.querySelector("[part='root']")}async _render(){let t=this._root;t.textContent="Loading data-providers…";let r=(await m("/api/providers"))?.providers??[];if(t.innerHTML="",r.length===0){let a=document.createElement("p9r-alert");a.setAttribute("type","info"),a.innerHTML='No data-provider imported. <a href="../providers/">Import one first</a>.',t.appendChild(a);return}let i=document.createElement("p9r-select");i.setAttribute("name","providerId"),i.setAttribute("label","Data-provider");for(let a of r){let c=document.createElement("option");c.value=a.providerId,c.textContent=a.providerKind?`${a.providerId} (${a.providerKind})`:a.providerId,i.appendChild(c)}let o=document.createElement("p9r-input");o.setAttribute("name","displayName"),o.setAttribute("label","Display name (optional)");let n=document.createElement("p9r-button");n.setAttribute("color","primary"),n.textContent="Create tenant",n.addEventListener("click",()=>void this._create(i,o,n));let l=document.createElement("div");l.className="msg",t.append(i,o,n,l)}async _create(t,e,r){let i=this.shadowRoot.querySelector(".msg");i.innerHTML="";let o=t.value??t.getAttribute("value")??"";if(!o){this._error(i,"Pick a data-provider.");return}let n=(e.value??e.getAttribute("value")??"").trim();r.setAttribute("disabled","");let l=`/api/namespaces/tenants?namespaceId=${encodeURIComponent(this._namespaceId)}&providerId=${encodeURIComponent(o)}`,a=await s("POST",l,{issuers:[],...n?{displayName:n}:{}});if(r.removeAttribute("disabled"),a.ok)document.dispatchEvent(new CustomEvent("tenant:created",{bubbles:!0})),this.dispatchEvent(new CustomEvent("form:success",{bubbles:!0,composed:!0}));else this._error(i,a.message)}_error(t,e){let r=document.createElement("p9r-alert");r.setAttribute("type","error"),r.textContent=`Failed: ${e}`,t.appendChild(r)}}if(!customElements.get("hub-add-tenant"))customElements.define("hub-add-tenant",J);var N=`:host { display: block; }

[part="root"] { display: flex; flex-direction: column; gap: 1rem; }

.bar { display: flex; gap: 1rem; flex-wrap: wrap; align-items: end; }

/* Keep the filter dropdowns a stable width — otherwise the host collapses to
 * the chevron when "All" is selected and jumps around on each change. */
.bar p9r-select { display: inline-block; min-width: 9rem; }

.rows {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-default);
    border-radius: 8px;
    background: var(--bg-surface);
    overflow: auto;
    max-height: 28rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
}
.rows:empty { display: none; }

.row {
    display: grid;
    grid-template-columns: 12rem 5.5rem 4rem 1fr auto;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border-light, var(--border-default));
    color: var(--text-body);
}
.row:last-child { border-bottom: 0; }

.ts { color: var(--text-muted); white-space: nowrap; }

.tag {
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--text-label, var(--text-muted));
}

.event { color: var(--text-main); word-break: break-word; }
.meta  { color: var(--text-muted); white-space: nowrap; }

/* Level accent via the theme status tokens — no hardcoded colors. */
.row.level-warn  .tag.level { color: var(--warning-base); }
.row.level-error .tag.level { color: var(--danger-base); }
.row.level-info  .tag.level { color: var(--info-base); }

.empty[hidden], .more[hidden] { display: none; }
.more { align-self: flex-start; }
`;class I extends d{_items=[];_cursor=void 0;_kind="";_level="";_onTenantEvent=()=>{this._load(!0)};constructor(){super({css:N,template:"<div part='root'></div>"})}connectedCallback(){this._renderShell(),this._load(!0);for(let t of["tenant:created","tenant:updated","tenant:removed"])document.addEventListener(t,this._onTenantEvent)}disconnectedCallback(){for(let t of["tenant:created","tenant:updated","tenant:removed"])document.removeEventListener(t,this._onTenantEvent)}get _src(){return this.getAttribute("src")||""}get _root(){return this.shadowRoot.querySelector("[part='root']")}_scopeParam(){for(let t of["tenantId","providerId","namespaceId"]){let e=f(t);if(e)return`${t}=${encodeURIComponent(e)}`}return""}_renderShell(){let t=this._root;t.innerHTML="";let e=document.createElement("div");e.className="bar",e.append(this._select("kind","Kind",["all","security","audit","request"],(n)=>{this._kind=n,this._load(!0)}),this._select("level","Level",["all","debug","info","warn","error"],(n)=>{this._level=n,this._load(!0)}));let r=document.createElement("div");r.className="rows";let i=document.createElement("p9r-button");i.setAttribute("variant","ghost"),i.className="more",i.textContent="Load more",i.addEventListener("click",()=>void this._load(!1));let o=document.createElement("p9r-alert");o.setAttribute("type","info"),o.className="empty",o.textContent="No log entries.",t.append(e,r,o,i)}_select(t,e,r,i){let o=document.createElement("p9r-select");o.setAttribute("name",t),o.setAttribute("label",e);for(let n of r){let l=document.createElement("option");if(l.value=n,l.textContent=n==="all"?"All":n,n==="all")l.setAttribute("selected","");o.appendChild(l)}return o.addEventListener("change",()=>{let n=o.value??o.getAttribute("value")??"all";i(n==="all"?"":n)}),o}async _load(t){if(t)this._items=[],this._cursor=void 0;let e=this._scopeParam();if(!this._src||!e)return;let r=new URLSearchParams(e);if(this._kind)r.set("kind",this._kind);if(this._level)r.set("level",this._level);if(r.set("limit","50"),this._cursor)r.set("cursor",this._cursor);let o=await m(`${this._src}?${r.toString()}`)??{items:[],nextCursor:void 0};this._items=t?o.items:[...this._items,...o.items],this._cursor=o.nextCursor,this._renderRows()}_renderRows(){let t=this.shadowRoot.querySelector(".rows"),e=this.shadowRoot.querySelector(".empty"),r=this.shadowRoot.querySelector(".more");t.innerHTML="",e.hidden=this._items.length>0,r.hidden=!this._cursor;for(let i of this._items){let o=document.createElement("div");o.className=`row level-${i.level}`,o.innerHTML=`
                <span class="ts">${this._esc(i.ts)}</span>
                <span class="tag kind">${this._esc(i.kind)}</span>
                <span class="tag level">${this._esc(i.level)}</span>
                <span class="event">${this._esc(i.event)}</span>
                <span class="meta">${this._esc(i.outcome??"")}${i.tenantId?" · "+this._esc(i.tenantId):""}</span>`,t.appendChild(o)}}_esc(t){return String(t).replace(/[&<>"]/g,(e)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[e])}}if(!customElements.get("hub-logs"))customElements.define("hub-logs",I);function ft(t){if(!t)return"An error occurred.";let e=t.body;if(e&&typeof e==="object"&&e.error){let r=e.error;return`${r.code||"error"}: ${r.message||""}`.trim()}return`HTTP ${t.status??"?"}`}function ut(t){let e=t.querySelector(":scope > p9r-alert.hub-form-error");if(!e)e=document.createElement("p9r-alert"),e.setAttribute("type","error"),e.classList.add("hub-form-error"),t.appendChild(e);return e}document.addEventListener("form:failed",(t)=>{let e=t.target;if(!(e instanceof Element))return;let r=e.closest("p9r-modal")||e.closest("dialog")||e.parentElement||document.body;ut(r).textContent=ft(t.detail)});document.addEventListener("form:success",(t)=>{let e=t.target;if(!(e instanceof Element))return;(e.closest("p9r-modal")||e.parentElement)?.querySelector(":scope > p9r-alert.hub-form-error")?.remove()});})();
