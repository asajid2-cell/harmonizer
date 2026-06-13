// Server-rendered HTML. No client framework, no token in JS.
import { config, link } from "./config.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Visual system — "Harmonizer Labs front desk": warm light editorial. Cream paper, warm near-black
   ink, ONE vermilion accent, a monospace voice for eyebrows/labels/meta (the "Labs" identity),
   hairline warm rules, flat surfaces (no gradients/orbs/glass/shadow-soup), small radius, generous
   space, weight-driven hierarchy. System fonts (no web-font load risk on the SSO front door). */
const CSS = `
  :root{
    /* DARK (default) — near-black + rose */
    --paper:#0b0a0e;
    --paper-2:#15131a;
    --card:#161219;
    --field:#0f0d14;
    --ink:#f5f1f7;
    --ink-dim:#a8a3b1;
    --ink-faint:#736e7d;
    --line:#2a2733;
    --line-soft:#1c1a23;
    --dot:rgba(255,255,255,.038);
    --accent:#f0567f;
    --accent-press:#d83e64;
    --accent-ink:#170810;
    --accent-soft:rgba(240,86,127,.13);
    --ok:#5cce7d;
    --ok-soft:rgba(92,206,125,.13);
    --danger:#ff8080;
    --danger-soft:rgba(255,128,128,.11);
    --radius:10px;
    --radius-sm:7px;
    --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono:"SFMono-Regular",ui-monospace,"JetBrains Mono","Cascadia Mono",Menlo,Consolas,monospace;
    color-scheme:dark;
    font-family:var(--sans);
    background:var(--paper);
    color:var(--ink);
  }
  :root.light{
    /* LIGHT — warm cream + vermilion */
    --paper:#efe7d7;
    --paper-2:#e8dfca;
    --card:#fbf7ee;
    --field:#fffdf8;
    --ink:#1d1812;
    --ink-dim:#5d5547;
    --ink-faint:#8d846f;
    --line:#d8cdb6;
    --line-soft:#e6ddc9;
    --dot:#e6ddc9;
    --accent:#c8451f;
    --accent-press:#b23c19;
    --accent-ink:#fbf7ee;
    --accent-soft:rgba(200,69,31,.10);
    --ok:#3c7a3a;
    --ok-soft:rgba(60,122,58,.10);
    --danger:#b23a28;
    --danger-soft:rgba(178,58,40,.09);
    color-scheme:light;
  }
  *{box-sizing:border-box}
  html,body{min-height:100%;margin:0}
  body{
    min-height:100dvh;
    margin:0;
    overflow-x:hidden;
    background:var(--paper);
    background-image:radial-gradient(var(--dot) 1px,transparent 1px);
    background-size:22px 22px;
    background-position:-1px -1px;
    color:var(--ink);
    font-size:15.5px;
    line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1.5px}
  button,input,select{font:inherit;color:var(--ink)}
  button{
    min-height:44px;
    border:1px solid var(--line);
    border-radius:var(--radius-sm);
    padding:0 16px;
    background:var(--card);
    color:var(--ink);
    font-weight:600;
    cursor:pointer;
    transition:border-color .12s,background .12s;
  }
  button:hover{border-color:var(--ink-faint)}
  button:disabled{cursor:not-allowed;opacity:.5}
  button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{
    outline:2.5px solid var(--accent);
    outline-offset:2px;
  }
  input[type=text],input[type=password],select{
    width:100%;
    min-height:46px;
    border:1px solid var(--line);
    border-radius:var(--radius-sm);
    padding:0 13px;
    background:var(--field);
    color:var(--ink);
  }
  input[type=text]:hover,input[type=password]:hover,select:hover{border-color:var(--ink-faint)}
  input::placeholder{color:var(--ink-faint)}
  input[readonly]{color:var(--ink-dim);background:var(--paper-2)}
  select{appearance:auto}
  label{
    display:block;
    margin:15px 0 6px;
    color:var(--ink-dim);
    font-family:var(--mono);
    font-size:11px;
    font-weight:600;
    letter-spacing:.04em;
    text-transform:uppercase;
  }
  h1,h2,h3,p{margin-top:0}
  h1{margin-bottom:8px;font-size:clamp(27px,4.5vw,33px);line-height:1.08;letter-spacing:-.018em;font-weight:700;overflow-wrap:anywhere;min-width:0}
  h2{
    margin:0 0 13px;
    color:var(--ink);
    font-family:var(--mono);
    font-size:12px;
    font-weight:600;
    letter-spacing:.045em;
    text-transform:uppercase;
  }
  h3{margin:0 0 6px;font-size:16px;line-height:1.25;font-weight:600}
  p{line-height:1.55;overflow-wrap:anywhere}
  .muted,p.sub,small{color:var(--ink-dim)}
  p.sub{margin:0 0 22px;font-size:14.5px;max-width:60ch}
  small{display:block;font-size:13px;color:var(--ink-faint)}
  code,.mono{font-family:var(--mono)}
  code{display:inline-block;border:1px solid var(--line);border-radius:5px;padding:2px 6px;background:var(--paper-2);font-size:.92em}

  .site-shell{min-height:100dvh}
  .site-shell.is-auth{
    min-height:100dvh;
    display:grid;
    align-content:center;
    justify-items:center;
    padding:34px 20px 48px;
  }
  .topbar{
    width:min(1180px,calc(100vw - 40px));
    min-height:64px;
    margin:0 auto;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
    flex-wrap:wrap;
  }
  .brand{display:inline-flex;align-items:center;color:var(--ink);line-height:1}
  .brand-logo{display:block;width:230px;max-width:100%;height:auto;overflow:visible}
  .logo-word{fill:var(--ink)}
  .logo-wave-white{fill:var(--ink)}
  .logo-wave-rose{fill:var(--accent)}
  .brand:hover .logo-wave-rose{fill:var(--accent-press)}
  .is-auth .topbar{width:min(440px,100%);min-height:auto;margin:0 0 20px;justify-content:space-between}
  .is-auth .brand-logo{width:236px}
  .top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}

  .auth-main{min-height:0;width:min(440px,100%);display:block;padding:0}
  .wrap{width:min(1180px,calc(100vw - 40px));margin:0 auto;padding:14px 0 56px}

  .card{
    width:min(440px,100%);
    margin:0 auto;
    border:1px solid var(--line);
    border-radius:var(--radius);
    padding:34px 32px;
    background:var(--card);
    box-shadow:0 1px 0 var(--line-soft),0 14px 30px -22px rgba(40,30,15,.4);
  }
  .card-head{display:block;margin-bottom:20px;padding-top:14px;border-top:3px solid var(--accent)}
  .eyebrow{
    margin:0 0 10px;
    color:var(--accent);
    font-family:var(--mono);
    font-size:11px;
    font-weight:600;
    letter-spacing:.1em;
    text-transform:uppercase;
  }
  .panel{
    border:1px solid var(--line);
    border-radius:var(--radius);
    padding:20px;
    margin-bottom:18px;
    background:var(--card);
    box-shadow:0 1px 0 var(--line-soft);
  }
  .panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap}
  .panel-head h2{margin-bottom:5px}
  .panel-head p{margin:0;color:var(--ink-dim);font-size:13px;max-width:62ch}
  .hero-panel{
    display:grid;
    gap:14px;
    margin-bottom:20px;
    padding:22px 22px 22px 25px;
    border:1px solid var(--line);
    border-left:3px solid var(--accent);
    border-radius:var(--radius);
    background:var(--card);
  }
  .hero-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .hero-row > div{min-width:0}
  .hero-row h1{margin-bottom:0}
  .hero-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .stat-row{display:flex;gap:14px 26px;flex-wrap:wrap;align-items:baseline}
  .stat{font-family:var(--mono);font-size:12px;color:var(--ink-dim);display:inline-flex;align-items:baseline;gap:7px;text-transform:uppercase;letter-spacing:.04em}
  .stat b{font-family:var(--sans);font-size:20px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
  td.seen{white-space:nowrap;color:var(--ink-dim);font-family:var(--mono);font-size:12px}

  .btn-primary,button.btn-primary{
    min-height:46px;
    border:1px solid var(--accent);
    background:var(--accent);
    color:var(--accent-ink);
    font-weight:700;
    letter-spacing:.005em;
  }
  .btn-primary:hover{background:var(--accent-press);border-color:var(--accent-press)}
  .theme-toggle{
    min-height:38px;padding:0 13px;border:1px solid var(--line);border-radius:999px;
    background:var(--paper-2);color:var(--ink-dim);
    font-family:var(--mono);font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
    display:inline-flex;align-items:center;gap:7px;cursor:pointer;
  }
  .theme-toggle:hover{border-color:var(--accent);color:var(--accent)}
  .theme-toggle .tdot{width:9px;height:9px;border-radius:50%;background:var(--accent);flex:none}
  .theme-toggle .to-dark{display:none}
  :root.light .theme-toggle .to-light{display:none}
  :root.light .theme-toggle .to-dark{display:inline}
  .button-full{width:100%;margin-top:20px}
  button.ghost,.ghost-link{width:auto;border:1px solid var(--line);background:var(--card);color:var(--ink);font-weight:600}
  .ghost-link{display:inline-flex;align-items:center;min-height:38px;padding:0 12px;border-radius:var(--radius-sm)}
  button.danger,.danger{border-color:color-mix(in srgb,var(--danger) 55%,var(--line));background:var(--danger-soft);color:var(--danger);font-weight:700}
  button.danger:hover{border-color:var(--danger)}
  .link-pill,.pill{
    display:inline-flex;align-items:center;gap:6px;min-height:28px;
    border:1px solid var(--line);border-radius:999px;padding:4px 11px;
    background:var(--paper-2);color:var(--ink-dim);
    font-family:var(--mono);font-size:11.5px;font-weight:600;letter-spacing:.02em;
  }
  .link-pill{color:var(--ink);min-height:38px;padding:0 14px}
  .link-pill:hover{border-color:var(--accent);color:var(--accent)}
  .pill.is-rose{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:var(--accent-soft);color:var(--accent)}
  .pill.is-green{border-color:color-mix(in srgb,var(--ok) 45%,var(--line));background:var(--ok-soft);color:var(--ok)}
  .err,.ok{border-radius:var(--radius-sm);padding:11px 13px;margin:14px 0;font-size:13.5px;line-height:1.45;border:1px solid}
  .err{border-color:color-mix(in srgb,var(--danger) 50%,var(--line));background:var(--danger-soft);color:var(--danger)}
  .ok{border-color:color-mix(in srgb,var(--ok) 50%,var(--line));background:var(--ok-soft);color:var(--ok)}

  .field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end}
  .field-grid .wide{grid-column:span 2}
  .row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
  .row > div{flex:1;min-width:150px}
  .inline-form{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
  .stack{display:grid;gap:8px}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:18px}

  .grid-links{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:12px}
  .access-link{
    display:grid;grid-template-columns:minmax(0,1fr);gap:4px;min-height:74px;min-width:0;
    border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px 15px;
    background:var(--card);transition:border-color .12s,transform .12s;
  }
  .access-link strong{min-width:0;overflow-wrap:anywhere}
  .access-link:hover{border-color:var(--accent);transform:translateY(-1px)}
  .access-link strong{color:var(--ink);font-weight:650}
  .access-link span{color:var(--ink-faint);font-family:var(--mono);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  .table-wrap{width:100%;overflow:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--card)}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{padding:12px 13px;border-bottom:1px solid var(--line-soft);vertical-align:top;text-align:left}
  th{color:var(--ink-faint);font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;background:var(--paper-2)}
  tr:last-child td{border-bottom:0}
  td.actions{min-width:340px}
  td.can-open{max-width:280px;color:var(--ink-dim);overflow-wrap:anywhere}
  .status-note{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .empty{margin:0;color:var(--ink-dim);font-size:13.5px}
  .admin-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}
  .danger-zone{border-color:color-mix(in srgb,var(--danger) 30%,var(--line))}
  .copy-grid{display:grid;gap:12px}
  .copy-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}

  @media (max-width:860px){
    .topbar,.wrap{width:min(100%,calc(100vw - 28px))}
    .auth-main{width:100%}
    .card{padding:28px 22px}
    .admin-grid,.split,.field-grid{grid-template-columns:1fr}
    .field-grid .wide{grid-column:auto}
    .panel,.hero-panel{padding:17px}
    td.actions{min-width:280px}
  }
  @media (max-width:560px){
    .site-shell.is-auth{padding:22px 14px 34px}
    .is-auth .topbar{width:100%}
    .brand-logo,.is-auth .brand-logo{width:210px}
    .hero-actions{width:100%}
    .hero-actions .link-pill,.hero-actions form,.hero-actions button{width:100%}
    .hero-actions form{display:block}
    .hero-actions button{justify-content:center}
    .row,.inline-form{display:grid}
    .inline-form select,.inline-form button,.inline-form input{width:100%}
    th,td{padding:10px}
  }
`;

const brandLogo = () => `
      <svg class="brand-logo" viewBox="0 0 340 56" role="img" aria-labelledby="hl-logo-title" xmlns="http://www.w3.org/2000/svg">
        <title id="hl-logo-title">Harmonizer Labs</title>
        <g aria-hidden="true">
          <rect class="logo-wave-rose" x="5" y="25" width="7" height="7" rx="3.5"/>
          <rect class="logo-wave-rose" x="21" y="21" width="8" height="15" rx="4"/>
          <rect class="logo-wave-rose" x="38" y="16" width="8" height="25" rx="4"/>
          <rect class="logo-wave-rose" x="55" y="8" width="8" height="41" rx="4"/>
          <rect class="logo-wave-rose" x="72" y="1" width="8" height="54" rx="4"/>
          <rect class="logo-wave-white" x="90" y="10" width="8" height="37" rx="4"/>
          <rect class="logo-wave-white" x="107" y="17" width="8" height="23" rx="4"/>
          <rect class="logo-wave-white" x="124" y="22" width="8" height="13" rx="4"/>
          <rect class="logo-wave-white" x="141" y="25" width="7" height="7" rx="3.5"/>
        </g>
        <text class="logo-word" x="172" y="36" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="25" font-weight="780" letter-spacing="0">Harmonizer Labs</text>
      </svg>`;

function layout({ title, body, wide = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<script>try{if(localStorage.getItem("hl-theme")==="light")document.documentElement.classList.add("light")}catch(e){}</script>
<style>${CSS}</style></head>
<body><div class="site-shell ${wide ? "is-wide" : "is-auth"}">
  <header class="topbar">
    <a class="brand" href="${link("/")}">
${brandLogo()}
    </a>
    <button class="theme-toggle" type="button" aria-label="Switch between light and dark theme" onclick="(function(d){var l=d.documentElement.classList.toggle('light');try{localStorage.setItem('hl-theme',l?'light':'dark')}catch(e){}})(document)"><span class="tdot"></span><span class="to-light">Light</span><span class="to-dark">Dark</span></button>
  </header>
  <main class="${wide ? "wrap" : "auth-main"}">${body}</main>
</div></body></html>`;
}

const errBox = (e) => (e ? `<div class="err" role="alert">${esc(e)}</div>` : "");
const okBox = (m) => (m ? `<div class="ok" role="status">${esc(m)}</div>` : "");

export function loginPage({ next = "", error = "", csrf }) {
  return layout({
    title: "Sign in - Harmonizer Labs",
    body: `<section class="card" aria-label="Sign in">
      <div class="card-head">
        <p class="eyebrow">Secure access</p>
        <h1>Sign in</h1>
        <p class="sub">One account covers the entire Harmonizer Labs tool suite.</p>
      </div>
      ${errBox(error)}
      <form method="post" action="${link("/login")}">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <input type="hidden" name="next" value="${esc(next)}">
        <label for="username">Username</label>
        <input id="username" type="text" name="username" autocomplete="username" autofocus>
        <label for="password">Password</label>
        <input id="password" type="password" name="password" autocomplete="current-password">
        <button class="btn-primary button-full" type="submit">Sign in</button>
      </form>
      <p class="sub" style="margin:18px 0 0">Have an invite code? <a href="${link("/claim")}">Create your account</a>.</p>
    </section>`
  });
}

export function claimPage({ code = "", error = "", csrf, status = null }) {
  const banner = status
    ? status.valid
      ? `<div class="ok" role="status">Valid invite${status.roleName ? ` - you will join as <strong>${esc(status.roleName)}</strong>` : ""}. Pick a username and password below.</div>`
      : `<div class="err" role="alert">${esc(status.reason)} You can paste a different code.</div>`
    : "";
  return layout({
    title: "Create account - Harmonizer Labs",
    body: `<section class="card" aria-label="Create account">
      <div class="card-head">
        <p class="eyebrow">Invite required</p>
        <h1>Create your account</h1>
        <p class="sub">Use your invite code, then choose a username and password.</p>
      </div>
      ${banner}${errBox(error)}
      <form method="post" action="${link("/claim")}">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <label for="code">Invite code</label>
        <input id="code" type="text" name="code" value="${esc(code)}" ${code ? "" : "autofocus"}>
        <label for="claim-username">Username</label>
        <input id="claim-username" type="text" name="username" autocomplete="username" ${code ? "autofocus" : ""}>
        <small>3-32 characters: letters, numbers, dot, underscore, or dash.</small>
        <label for="claim-password">Password</label>
        <input id="claim-password" type="password" name="password" autocomplete="new-password">
        <small>Minimum 8 characters.</small>
        <button class="btn-primary button-full" type="submit">Create account</button>
      </form>
      <p class="sub" style="margin:18px 0 0">Already have an account? <a href="${link("/login")}">Sign in</a>.</p>
    </section>`
  });
}

export function accountPage({ username, isMaster, pages, isAdminUser }) {
  const links = pages.length
    ? `<div class="grid-links">${pages
        .map((p) => `<a class="access-link" href="${esc(p.path_prefix)}"><strong>${esc(p.label)}</strong><span>${esc(p.path_prefix)}</span></a>`)
        .join("")}</div>`
    : `<p class="empty">You do not have access to any pages yet. Ask the admin to grant you access.</p>`;

  return layout({
    wide: true,
    title: "Your account - Harmonizer Labs",
    body: `<section class="hero-panel">
      <div class="hero-row">
        <div>
          <p class="eyebrow">Account</p>
          <h1>Hi, ${esc(username)} ${isMaster ? '<span class="pill is-rose">master</span>' : ""}</h1>
          <p class="sub" style="margin:8px 0 0">Pages you can open${isMaster ? " (master = all pages)" : ""}.</p>
        </div>
        <div class="hero-actions">
          ${isAdminUser ? `<a class="link-pill" href="${link("/admin")}">Admin dashboard</a>` : ""}
          ${!isMaster ? `<a class="link-pill" href="${link("/password")}">Change password</a>` : ""}
          <form method="post" action="${link("/logout")}" style="display:inline">
            <button class="ghost" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Available pages</h2>
          <p>Access is resolved from your roles plus direct grants or denies.</p>
        </div>
      </div>
      ${links}
    </section>`
  });
}

export function changePasswordPage({ username, isMaster, csrf, pwOk = "", pwErr = "" }) {
  if (isMaster) {
    return layout({
      title: "Change password - Harmonizer Labs",
      body: `<section class="card">
        <div class="card-head">
          <p class="eyebrow">Master session</p>
          <h1>Change password</h1>
          <p class="sub">A master session has no account password. Rotate the master password from the admin dashboard instead.</p>
        </div>
        <a class="link-pill" href="${link("/admin")}">Back to admin dashboard</a>
      </section>`
    });
  }
  return layout({
    title: "Change password - Harmonizer Labs",
    body: `<section class="card">
      <div class="card-head">
        <p class="eyebrow">Account security</p>
        <h1>Change password</h1>
        <p class="sub">Signed in as ${esc(username)}.</p>
      </div>
      ${okBox(pwOk)}${errBox(pwErr)}
      <form method="post" action="${link("/account/password")}">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <label for="current-password">Current password</label>
        <input id="current-password" type="password" name="current_password" autocomplete="current-password" autofocus>
        <label for="new-password">New password</label>
        <input id="new-password" type="password" name="new_password" autocomplete="new-password">
        <small>Minimum 8 characters.</small>
        <button class="btn-primary button-full" type="submit">Update password</button>
      </form>
      <p class="sub" style="margin:16px 0 0"><a href="${link("/account")}">Back to account</a></p>
    </section>`
  });
}

export function notice({ title, message, link: l }) {
  return layout({
    title,
    body: `<section class="card">
      <div class="card-head">
        <p class="eyebrow">Notice</p>
        <h1>${esc(title)}</h1>
        <p class="sub">${esc(message)}</p>
      </div>
      ${l ? `<a class="link-pill" href="${esc(l.href)}">${esc(l.label)}</a>` : ""}
    </section>`
  });
}

// --- admin dashboard --------------------------------------------------------

export function adminPage(data) {
  const { csrf, flash, error, roles, pages, accessModes = ["public", "members", "restricted"], users, sessions, invites, audit, isOwnerViewer = false, masterConfigured, verifyCacheSeconds } = data;
  const fmtSeen = (ts) => (ts ? new Date(ts).toISOString().slice(0, 16).replace("T", " ") : "—");

  const roleOpts = roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
  const pageOpts = pages.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
  const accessOpts = (current) =>
    accessModes.map((m) => `<option value="${esc(m)}"${m === current ? " selected" : ""}>${esc(m)}</option>`).join("");
  const pageRows = pages
    .map(
      (p) => `<tr>
        <td><strong>${esc(p.label)}</strong><br><span class="muted mono">${esc(p.id)}</span></td>
        <td class="muted mono">${esc(p.path_prefix)}</td>
        <td><form method="post" action="${link("/admin/pages/access")}" class="inline-form">
          <input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="page_id" value="${esc(p.id)}">
          <select name="access">${accessOpts(p.access)}</select>
          <button class="ghost">Save</button>
        </form></td>
      </tr>`
    )
    .join("");

  const userRows = users
    .map((u) => {
      const isOwnerRow = u.roles.includes("owner");
      const manage = isOwnerRow
        ? '<span class="pill is-rose">protected</span> <span class="muted">owner account cannot be modified</span>'
        : `<div class="stack">
            <form method="post" action="${link("/admin/users/role")}" class="inline-form">
              <input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="user_id" value="${esc(u.id)}">
              <select name="role_id">${roleOpts}</select>
              <button class="ghost" name="op" value="add">+ role</button>
              <button class="ghost" name="op" value="remove">- role</button>
            </form>
            <form method="post" action="${link("/admin/users/override")}" class="inline-form">
              <input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="user_id" value="${esc(u.id)}">
              <select name="page_id">${pageOpts}</select>
              <button class="ghost" name="effect" value="grant">grant</button>
              <button class="ghost" name="effect" value="deny">deny</button>
              <button class="ghost" name="effect" value="clear">clear</button>
            </form>
            <form method="post" action="${link("/admin/users/status")}">
              <input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="user_id" value="${esc(u.id)}">
              ${u.status === "suspended"
                ? `<button class="ghost" name="op" value="restore">restore</button>`
                : `<button class="danger" name="op" value="suspend">suspend</button>`}
            </form>
            ${isOwnerViewer ? `<form method="post" action="${link("/admin/users/password")}" class="inline-form">
              <input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="user_id" value="${esc(u.id)}">
              <input type="password" name="new_password" placeholder="new password" autocomplete="new-password" style="width:auto;min-width:150px">
              <button class="ghost">reset password</button>
            </form>` : ""}
          </div>`;
      return `<tr>
        <td><strong>${esc(u.username)}</strong> ${u.status === "suspended" ? '<span class="pill">suspended</span>' : ""}</td>
        <td>${u.roles.map((r) => `<span class="pill">${esc(r)}</span>`).join(" ") || '<span class="muted">none</span>'}</td>
        <td class="seen">${fmtSeen(u.lastSeen)}</td>
        <td class="can-open">${esc(u.pages.join(", ") || "-")}</td>
        <td class="actions">${manage}</td>
      </tr>`;
    })
    .join("");

  const sessionRows = sessions
    .map(
      (s) => `<tr>
        <td><strong>${esc(s.username)}</strong> ${s.is_master ? '<span class="pill is-rose">master</span>' : ""}</td>
        <td class="muted mono">${esc(s.device_label || "")}</td>
        <td class="muted">${esc(s.ip || "")}</td>
        <td class="muted">${new Date(s.last_seen_at).toISOString().slice(0, 16).replace("T", " ")}</td>
        <td><form method="post" action="${link("/admin/sessions/kill")}"><input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="session_id" value="${esc(s.id)}"><button class="danger">kill</button></form></td>
      </tr>`
    )
    .join("");

  const inviteRows = invites
    .map(
      (i) => `<tr>
        <td class="muted">${esc(i.note || "-")}</td>
        <td><span class="pill">${esc(i.role_name || "member")}</span></td>
        <td class="muted">${esc(i.expiryLabel)}</td>
        <td>${i.open ? '<span class="pill is-green">open</span>' : `claimed by ${esc(i.claimed_username || "?")}`}</td>
        <td>${i.open ? `<form method="post" action="${link("/admin/invites/revoke")}"><input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="invite_id" value="${esc(i.id)}"><button class="danger">revoke</button></form>` : ""}</td>
      </tr>`
    )
    .join("");

  const auditRows = audit
    .map(
      (a) => `<tr><td class="muted">${new Date(a.ts).toISOString().slice(0, 19).replace("T", " ")}</td>
        <td>${esc(a.actor || "")}</td><td><strong>${esc(a.action)}</strong></td><td class="muted">${esc(a.target || "")}</td><td class="muted">${esc(a.ip || "")}</td></tr>`
    )
    .join("");

  return layout({
    wide: true,
    title: "Admin - Harmonizer Labs",
    body: `
    <section class="hero-panel">
      <div class="hero-row">
        <div>
          <p class="eyebrow">Owner console</p>
          <h1>Admin dashboard</h1>
          <p class="sub" style="margin:8px 0 0">Manage invites, users, sessions, and emergency access.</p>
        </div>
        <div class="hero-actions">
          <a class="link-pill" href="${link("/account")}">My account</a>
          <a class="link-pill" href="${link("/password")}">Change password</a>
          <form method="post" action="${link("/logout")}" style="display:inline"><button class="ghost">Sign out</button></form>
        </div>
      </div>
      <div class="stat-row" style="margin-top:2px">
        <span class="stat"><b>${users.length}</b> users</span>
        <span class="stat"><b>${sessions.length}</b> sessions</span>
        <span class="stat"><b>${invites.filter((i) => i.open).length}</b> open invites</span>
        <span class="stat"><b>${pages.length}</b> pages</span>
      </div>
      ${okBox(flash)}${errBox(error)}
    </section>

    <div class="admin-grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Create invite</h2>
            <p>The invite code is shown once. Copy it before leaving the next screen.</p>
          </div>
        </div>
        <form method="post" action="${link("/admin/invites")}" class="field-grid">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <div><label>Role</label><select name="role_id">${roleOpts}</select></div>
          <div><label>Expires</label><select name="expiry">
            <option value="1h">in 1 hour</option>
            <option value="1d">in 1 day</option>
            <option value="7d" selected>in 7 days</option>
            <option value="30d">in 30 days</option>
            <option value="never">never</option>
          </select></div>
          <div class="wide"><label>Note</label><input type="text" name="note" placeholder="e.g. for Sam"></div>
          <div><button class="btn-primary" style="width:100%">Generate code</button></div>
        </form>
      </section>

      ${isOwnerViewer ? `<section class="panel danger-zone">
        <div class="panel-head">
          <div>
            <h2>Master password ${masterConfigured ? '<span class="pill is-green">configured</span>' : '<span class="pill">not set</span>'}</h2>
            <p>Owner-only root key — opens every page. Rotate carefully.</p>
          </div>
        </div>
        <form method="post" action="${link("/admin/master")}" class="row">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <div><label>New master password</label><input type="password" name="master" autocomplete="new-password"></div>
          <div style="flex:0"><button class="danger">Set / rotate</button></div>
        </form>
      </section>` : ""}
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Users <span class="pill" id="user-count">${users.length}</span></h2>
          <p>Roles, <strong>per-icon access</strong> (grant or deny any page for this account), and suspension state.</p>
        </div>
        <input id="user-search" type="text" placeholder="Search users…" aria-label="Search users" style="max-width:230px">
      </div>
      <div class="table-wrap" data-destruct-ignore><table id="users-table"><tr><th>User</th><th>Roles</th><th>Last seen</th><th>Can open</th><th>Manage</th></tr>${userRows || ""}</table></div>
      <p class="empty" id="user-none" style="display:none;margin-top:12px">No users match that search.</p>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Pages &amp; landing icons</h2>
          <p>Each row is a lockable <strong>landing icon</strong>. <strong>public</strong> = everyone, always shown &middot; <strong>members</strong> = any signed-in account &middot; <strong>restricted</strong> = only accounts you grant (in <em>Users</em> above). The landing hides an icon an account can't open, and gated apps enforce it on click — no redeploy. A page left <strong>public</strong> stays visible to all; switch it to members or restricted to lock it down.</p>
        </div>
      </div>
      <div class="table-wrap" data-destruct-ignore><table><tr><th>Page</th><th>Path</th><th>Access mode</th></tr>${pageRows || ""}</table></div>
      <form method="post" action="${link("/admin/pages")}" class="field-grid" style="margin-top:16px">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <div><label>Page id</label><input type="text" name="page_id" placeholder="my-app"></div>
        <div><label>Label</label><input type="text" name="label" placeholder="My App"></div>
        <div><label>Path prefix</label><input type="text" name="path_prefix" placeholder="/my-app"></div>
        <div><label>Access</label><select name="access">${accessOpts("members")}</select></div>
        <div><button class="btn-primary" style="width:100%">Add page</button></div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Active sessions</h2>
          <p>Revocation propagates within about ${esc(verifyCacheSeconds)} seconds.</p>
        </div>
        <form method="post" action="${link("/admin/rotate-all")}">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <button class="danger">Rotate all sessions</button>
        </form>
      </div>
      <div class="table-wrap" data-destruct-ignore><table><tr><th>User</th><th>Device</th><th>IP</th><th>Last seen</th><th></th></tr>${sessionRows || ""}</table></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Outstanding invites</h2>
          <p>Open codes can be revoked before they are claimed.</p>
        </div>
      </div>
      <div class="table-wrap" data-destruct-ignore><table><tr><th>Note</th><th>Role</th><th>Expires</th><th>Status</th><th></th></tr>${inviteRows || ""}</table></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Recent activity</h2>
          <p>Latest admin and auth events.</p>
        </div>
        <input id="audit-search" type="text" placeholder="Filter activity…" aria-label="Filter activity" style="max-width:230px">
      </div>
      <div class="table-wrap" data-destruct-ignore><table id="audit-table"><tr><th>When (UTC)</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th></tr>${auditRows || ""}</table></div>
    </section>
    <script>
      (function(){
        function wire(inputId,tableId,opts){
          opts=opts||{};
          var s=document.getElementById(inputId),t=document.getElementById(tableId);
          if(!s||!t)return;
          var rows=[].slice.call(t.rows).filter(function(r){return !r.querySelector("th")});
          var c=opts.count&&document.getElementById(opts.count),n=opts.none&&document.getElementById(opts.none);
          s.addEventListener("input",function(){
            var q=s.value.trim().toLowerCase(),shown=0;
            rows.forEach(function(r){var hit=r.textContent.toLowerCase().indexOf(q)>=0;r.style.display=hit?"":"none";if(hit)shown++;});
            if(c)c.textContent=shown;
            if(n)n.style.display=shown?"none":"block";
          });
        }
        wire("user-search","users-table",{count:"user-count",none:"user-none"});
        wire("audit-search","audit-table");
      })();
    </script>`
  });
}

export function codeRevealPage({ code, claimUrl }) {
  return layout({
    title: "Invite created",
    body: `<section class="card">
      <div class="card-head">
        <p class="eyebrow">Invite created</p>
        <h1>Copy this code now</h1>
        <p class="sub">Shown once. Share either the code or the invite link.</p>
      </div>
      <div class="copy-grid">
        <div>
          <label for="code">Code</label>
          <input id="code" type="text" readonly value="${esc(code)}">
        </div>
        <div>
          <label for="url">Invite link</label>
          <input id="url" type="text" readonly value="${esc(claimUrl)}">
        </div>
      </div>
      <div class="copy-actions">
        <button id="copy" class="btn-primary" type="button">Copy link</button>
        <span id="copied" class="ok" style="display:none;margin:0">Copied!</span>
      </div>
      <p class="sub" style="margin:16px 0 0"><a href="${link("/admin")}">Back to admin</a></p>
      <script>
        document.getElementById("copy").addEventListener("click",function(){
          var u=document.getElementById("url"); u.select();
          (navigator.clipboard?navigator.clipboard.writeText(u.value):Promise.reject())
            .catch(function(){document.execCommand("copy");})
            .finally(function(){var c=document.getElementById("copied");c.style.display="inline-block";setTimeout(function(){c.style.display="none";},1500);});
        });
      </script>
    </section>`
  });
}
