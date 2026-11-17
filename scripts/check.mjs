#!/usr/bin/env -S node --no-warnings
// Promptflix repo checks. No dependencies, no network, no keys: `node scripts/check.mjs` (Node 22+).
// Runs locally and in CI on every PR. Each check prints what failed and why; exit code 1 on any failure.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const ROOT = new URL("..", import.meta.url).pathname;
const errors = [];
const fail = (where, msg) => errors.push(`✗ ${where}: ${msg}`);
const files = execSync("git ls-files -co --exclude-standard", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean).filter(f => existsSync(join(ROOT, f)));

// 1. Every page's scripts compile together, in load order. The site uses classic <script>s that share one global scope,
//    so two files declaring the same top-level const/let/function name break the page. Compiling them as one script catches it.
const PAGES = files.filter(f => f.endsWith(".html"));
for (const page of PAGES){
  const html = readFileSync(join(ROOT, page), "utf8");
  let joined = "";
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const attrs = m[1], src = (attrs.match(/\bsrc="([^"]+)"/) || [])[1];
    if (/type="(module|application\/ld\+json)"/.test(attrs)) continue;
    if (src){
      if (/^(https?:)?\/\//.test(src)) continue;                    // CDN script
      const p = join(ROOT, dirname(page), src);
      if (!existsSync(p)) { fail(page, `script not found: ${src}`); continue; }
      joined += `\n;// ---- ${relative(ROOT, p)}\n` + readFileSync(p, "utf8");
    } else joined += `\n;// ---- ${page} inline\n` + m[2];
  }
  try { new vm.Script(joined, { filename: page }); }
  catch (e) { fail(page, `${e.name}: ${e.message} (scripts on this page share one global scope — look for a duplicate top-level name)`); }
}

// 2. Standalone JS and the Deno payments function parse on their own.
for (const f of files.filter(f => f.endsWith(".js") || f.endsWith(".mjs"))){
  try { execSync(`node --check ${JSON.stringify(join(ROOT, f))}`, { stdio: "pipe" }); }
  catch (e) { fail(f, String(e.stderr || e.message).split("\n").slice(0, 4).join(" ")); }
}
for (const f of files.filter(f => f.endsWith(".ts"))){
  try { new vm.Script(stripTypeScriptTypes(readFileSync(join(ROOT, f), "utf8")).replace(/^\s*(import|export)\b.*$/gm, ""), { filename: f }); }
  catch (e) { fail(f, `${e.name}: ${e.message}`); }
}

// 3. No secrets in the repo. Only publishable keys belong in market/config.js; secrets go in Supabase function env.
const SECRETS = [
  [/\bsk_(live|test)_[A-Za-z0-9]{12,}/, "Stripe secret key"],
  [/\brk_(live|test)_[A-Za-z0-9]{12,}/, "Stripe restricted key"],
  [/\bwhsec_[A-Za-z0-9]{12,}/, "Stripe webhook secret"],
  [/\bGOCSPX-[A-Za-z0-9_-]{10,}/, "Google OAuth client secret"],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/, "Supabase service_role JWT"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
];
for (const f of files.filter(f => !/\.(png|jpe?g|webp|gif|mp4|ico|woff2?)$/i.test(f) && f !== "scripts/check.mjs")){
  const t = readFileSync(join(ROOT, f), "utf8");
  for (const [re, what] of SECRETS) if (re.test(t)) fail(f, `looks like a ${what}. Remove it and rotate it.`);
}

// 4. Repo hygiene.
for (const f of files){
  if (/(^|\/)\.DS_Store$/.test(f)) fail(f, "macOS .DS_Store must not be committed");
  if (/\.(html|js|css|md)$/.test(f) && /["'(]\/Users\/[^"')]+/.test(readFileSync(join(ROOT, f), "utf8"))) fail(f, "absolute local path; use a relative path");
}
const cfg = readFileSync(join(ROOT, "market/config.js"), "utf8");
if (/sk_live_|PAYPAL_SECRET|service_role/.test(cfg)) fail("market/config.js", "secret material in the public config");

if (errors.length){ console.error(errors.join("\n") + `\n\n${errors.length} problem(s).`); process.exit(1); }
console.log(`✓ ${PAGES.length} pages, ${files.filter(f => /\.(m?js|ts)$/.test(f)).length} scripts, ${files.length} files checked. All good.`);
