import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
const [,, name, tool, argsJson] = process.argv;
const cfg = JSON.parse(readFileSync(".mcp/mcp.json", "utf8")).mcpServers[name];
const exp = s => s.replaceAll("${PWD}", process.cwd());
const p = spawn(cfg.command, cfg.args.map(exp), { env: { ...process.env, ...Object.fromEntries(Object.entries(cfg.env ?? {}).map(([k, v]) => [k, exp(v)])) } });
let buf = "", id = 0; const pending = {};
p.stdout.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(l); if (pending[m.id]) pending[m.id](m); } catch {} } });
const rpc = (method, params) => new Promise(r => { pending[++id] = r; p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
if (tool === "list") { const r = await rpc("tools/list", {}); console.log(r.result.tools.map(t => `${t.name}${t.annotations?.readOnlyHint ? " (ro)" : ""}`).join(", ")); }
else { const r = await rpc("tools/call", { name: tool, arguments: JSON.parse(argsJson || "{}") }); console.log(JSON.stringify(r.result ?? r.error).slice(0, 700)); }
p.stdin.end(); p.kill(); process.exit(0);
