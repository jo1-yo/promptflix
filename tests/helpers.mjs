// Test helpers. No dependencies: `node --test tests/` (Node 22+).
// The site's scripts are classic <script>s that share one global scope, and the payments function is a Deno file.
// Both are loaded here the way they run for real: into one fresh context each, with the few globals they expect stubbed.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const ROOT = new URL("..", import.meta.url).pathname;
const read = f => readFileSync(ROOT + f, "utf8");

/** The browser data layer (seed.js → creators.js → store.js) over an in-memory localStorage. `app` is the site: merchant | creator | admin. */
export function loadStore(app = "merchant", config = {}){
  const saved = new Map();
  const ctx = vm.createContext({
    console, crypto, structuredClone,
    localStorage: { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, String(v)), removeItem: k => saved.delete(k) },
    document: { dispatchEvent(){}, addEventListener(){} },
    CustomEvent: class { constructor(type){ this.type = type; } },
  });
  vm.runInContext(`const APP = ${JSON.stringify(app)}; const CONFIG = ${JSON.stringify({ adminEmails: [], featured: [], ...config })};`, ctx);
  for (const f of ["seed.js", "creators.js", "store.js"]) vm.runInContext(read(f), ctx, { filename: f });
  const get = name => vm.runInContext(name, ctx);
  get("DB").load();
  return { DB: get("DB"), FEES: get("FEES"), cardFee: get("cardFee"), get };
}

/** The payments Edge Function. `env` is its environment; `routes` answers its outgoing fetches: [[urlPart, (url, init) => body | Response]]. */
export function loadPayments(env = {}, routes = []){
  const calls = [];
  let handler = null;
  const fetchStub = async (url, init = {}) => {
    url = String(url); calls.push({ url, init });
    const hit = routes.find(([part]) => url.includes(part));
    if (!hit) return new Response(JSON.stringify({ error: "no stub for " + url }), { status: 500 });
    const out = await hit[1](url, init);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
  };
  const ctx = vm.createContext({
    console, crypto, TextEncoder, Response, URLSearchParams, btoa, Date, Math, Number, JSON, Object, String, Error, Promise,
    fetch: fetchStub,
    Deno: { env: { get: k => env[k] }, serve: h => { handler = h; } },
  });
  vm.runInContext(stripTypeScriptTypes(read("server/functions/payments/index.ts")), ctx, { filename: "payments/index.ts" });
  const post = async (body, headers = {}) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const res = await handler(new Request("https://fn.test/payments", { method: "POST", headers, body: raw }));
    return { status: res.status, body: await res.json() };
  };
  return { post, calls, get: name => vm.runInContext(name, ctx) };
}

/** A Stripe-Signature header for `payload`, signed with `secret` at time `t` (seconds). */
export async function stripeSignature(payload, secret, t = Math.floor(Date.now() / 1000)){
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  return `t=${t},v1=${[...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("")}`;
}
