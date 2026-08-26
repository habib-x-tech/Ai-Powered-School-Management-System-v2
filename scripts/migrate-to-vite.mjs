import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const project = join(root, '..');
const source = join(project, '.source-original');

rmSync(source, { recursive: true, force: true });
execFileSync('git', ['clone', '--depth', '1', 'https://github.com/habib-x-tech/Ai-Powered-School-Management-System.git', source], { stdio: 'inherit' });
rmSync(join(source, '.git'), { recursive: true, force: true });

// Replace the simplified prototype with the real project source tree.
for (const entry of [
  'src', 'public', 'prisma', 'scripts', 'tests', 'uploads', 'download', 'tool-results',
  'components.json', 'tailwind.config.ts', 'eslint.config.mjs', 'tsconfig.json',
  '.env.example', '.gitignore', 'README.md'
]) {
  const src = join(source, entry);
  const dest = join(project, entry);
  if (!existsSync(src)) continue;
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

// Remove Next/Bun-specific entrypoints while preserving all app components and assets.
for (const p of [
  join(project, 'next.config.ts'),
  join(project, 'postcss.config.mjs'),
  join(project, 'bun.lock'),
]) rmSync(p, { force: true });

// Keep the original API route modules; Express will load them through the compatibility server.
// Convert only the tiny Next server-module surface used by those handlers.
function replaceInTree(dir) {
  if (!existsSync(dir)) return;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const name of execFileSync('node', ['-e', `const fs=require('fs'); for(const x of fs.readdirSync(process.argv[1],{withFileTypes:true})){console.log((x.isDirectory()?'D:':'F:')+x.name)}`, current], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
      const [kind, file] = [name[0], name.slice(2)];
      const full = join(current, file);
      if (kind === 'D') stack.push(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(full)) {
        let text = readFileSync(full, 'utf8');
        text = text.replace(/import\s+\{[^}]*\}\s+from\s+["']next\/server["'];?\s*/g, '');
        text = text.replace(/\bNextRequest\b/g, 'Request');
        text = text.replace(/\bNextResponse\b/g, 'Response');
        text = text.replace(/from\s+["']next\/link["']/g, 'from "@/compat/link"');
        text = text.replace(/from\s+["']next\/image["']/g, 'from "@/compat/image"');
        text = text.replace(/from\s+["']next\/navigation["']/g, 'from "@/compat/navigation"');
        text = text.replace(/from\s+["']next\/dynamic["']/g, 'from "@/compat/dynamic"');
        text = text.replace(/process\.env\.NEXT_PUBLIC_/g, 'import.meta.env.VITE_');
        writeFileSync(full, text);
      }
    }
  }
}
replaceInTree(join(project, 'src'));

// Replace Next-only auth cookie access with an Express request-context implementation.
writeFileSync(join(project, 'src/lib/request-context.ts'), `import { AsyncLocalStorage } from "node:async_hooks";\n\nexport type RequestContext = { req: any; res: any };\nconst storage = new AsyncLocalStorage<RequestContext>();\nexport const requestContext = {\n  run<T>(ctx: RequestContext, fn: () => Promise<T> | T) { return storage.run(ctx, fn); },\n  get() { return storage.getStore(); },\n};\n`);

writeFileSync(join(project, 'src/lib/auth.ts'), `import bcrypt from "bcryptjs";\nimport jwt from "jsonwebtoken";\nimport { db } from "@/lib/db";\nimport { requestContext } from "@/lib/request-context";\n\nconst SESSION_COOKIE = "kam_session";\nconst SESSION_SECRET = process.env.SESSION_SECRET || "kam-local-dev-secret-change-me";\nconst SESSION_TTL = 60 * 60 * 24 * 7;\n\nexport type Role = "student" | "teacher" | "admin";\nexport interface SessionPayload { uid: string; email: string; role: Role; name: string; }\n\nexport async function hashPassword(pw: string): Promise<string> { return bcrypt.hash(pw, 10); }\nexport async function verifyPassword(pw: string, hash: string): Promise<boolean> { return bcrypt.compare(pw, hash); }\nexport function signSession(payload: SessionPayload): string { return jwt.sign(payload, SESSION_SECRET, { expiresIn: SESSION_TTL }); }\nexport function verifySession(token: string): SessionPayload | null { try { return jwt.verify(token, SESSION_SECRET) as SessionPayload; } catch { return null; } }\n\nfunction getCookieValue(name: string): string | undefined {\n  const raw = requestContext.get()?.req?.headers?.cookie || "";\n  const match = raw.split(";").map((x: string) => x.trim()).find((x: string) => x.startsWith(name + "="));\n  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;\n}\nfunction serializeCookie(name: string, value: string, maxAge: number) {\n  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";\n  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;\n}\nexport async function setSessionCookie(payload: SessionPayload) {\n  const ctx = requestContext.get(); if (!ctx) return;\n  ctx.res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, signSession(payload), SESSION_TTL));\n}\nexport async function clearSessionCookie() {\n  const ctx = requestContext.get(); if (!ctx) return;\n  ctx.res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", 0));\n}\nexport async function getSessionCookie(): Promise<string | undefined> { return getCookieValue(SESSION_COOKIE); }\nexport async function getCurrentUser(): Promise<SessionPayload | null> { const token = await getSessionCookie(); return token ? verifySession(token) : null; }\nexport async function requireUser(): Promise<SessionPayload> { const u = await getCurrentUser(); if (!u) throw new Error("UNAUTHORIZED"); return u; }\nexport async function requireRole(...roles: Role[]): Promise<SessionPayload> { const u = await requireUser(); if (!roles.includes(u.role)) throw new Error("FORBIDDEN"); return u; }\n`);

// Restore a Vite entrypoint around the original page component.
mkdirSync(join(project, 'src/compat'), { recursive: true });
cpSync(join(project, 'src/app/page.tsx'), join(project, 'src/App.tsx'));
cpSync(join(project, 'src/app/globals.css'), join(project, 'src/globals.css'));
rmSync(join(project, 'src/app'), { recursive: true, force: true });

writeFileSync(join(project, 'src/main.tsx'), `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./globals.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`);

writeFileSync(join(project, 'src/compat/link.tsx'), `import React from "react";\nexport default function Link({ href, children, ...props }: any) { return <a href={href} {...props}>{children}</a>; }\n`);
writeFileSync(join(project, 'src/compat/image.tsx'), `import React from "react";\nexport default function Image({ src, alt = "", ...props }: any) { return <img src={typeof src === "string" ? src : src?.src} alt={alt} {...props} />; }\n`);
writeFileSync(join(project, 'src/compat/dynamic.tsx'), `import React, { Suspense, lazy } from "react";\nexport default function dynamic(loader: any, options: any = {}) { const C = lazy(() => loader()); return (props: any) => <Suspense fallback={options.loading ? <options.loading /> : null}><C {...props} /></Suspense>; }\n`);
writeFileSync(join(project, 'src/compat/navigation.ts'), `import { useMemo } from "react";\nexport function useRouter() { return useMemo(() => ({ push: (p: string) => { window.location.href = p; }, replace: (p: string) => { window.location.replace(p); }, back: () => window.history.back(), refresh: () => window.location.reload() }), []); }\nexport function usePathname() { return window.location.pathname; }\nexport function useSearchParams() { return new URLSearchParams(window.location.search); }\n`);

writeFileSync(join(project, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Kaliachak Abasik Mission</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`);

writeFileSync(join(project, 'vite.config.ts'), `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport path from "node:path";\nexport default defineConfig({ plugins: [react()], resolve: { alias: { "@": path.resolve(__dirname, "src") } }, server: { port: 5173, proxy: { "/api": "http://localhost:5000", "/uploads": "http://localhost:5000" } } });\n`);

writeFileSync(join(project, 'tsconfig.json'), `{\n  "compilerOptions": {\n    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"], "allowJs": false, "skipLibCheck": true, "esModuleInterop": true, "allowSyntheticDefaultImports": true, "strict": false, "forceConsistentCasingInFileNames": true, "module": "ESNext", "moduleResolution": "Bundler", "resolveJsonModule": true, "isolatedModules": true, "noEmit": true, "jsx": "react-jsx", "baseUrl": ".", "paths": { "@/*": ["src/*"] }\n  },\n  "include": ["src", "server", "vite.config.ts"]\n}\n`);

// Express compatibility server: dynamically maps every Next route module to the same URL and method.
mkdirSync(join(project, 'server'), { recursive: true });
writeFileSync(join(project, 'server/server.ts'), `import express from "express";\nimport cors from "cors";\nimport fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath, pathToFileURL } from "node:url";\nimport { requestContext } from "@/lib/request-context";\n\nconst __dirname = path.dirname(fileURLToPath(import.meta.url));\nconst root = path.resolve(__dirname, "..");\nconst app = express();\napp.use(cors({ origin: true, credentials: true }));\n\nfunction collectRoutes(dir: string, out: string[] = []) {\n  if (!fs.existsSync(dir)) return out;\n  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {\n    const p = path.join(dir, entry.name);\n    if (entry.isDirectory()) collectRoutes(p, out); else if (entry.name === "route.ts") out.push(p);\n  }\n  return out;\n}\nasync function readBody(req: express.Request) {\n  if (["GET", "HEAD"].includes(req.method)) return undefined;\n  return await new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; let size = 0; req.on("data", c => { size += c.length; if (size > 60 * 1024 * 1024) { reject(new Error("Request too large")); req.destroy(); } else chunks.push(Buffer.from(c)); }); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject); });\n}\nfunction toWebRequest(req: express.Request, body?: Buffer) {\n  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) { if (Array.isArray(v)) headers.set(k, v.join(", ")); else if (v != null) headers.set(k, v); }\n  return new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, { method: req.method, headers, body: body && body.length ? body : undefined, duplex: "half" });\n}\nfunction expressPath(routeFile: string) {\n  const rel = path.relative(path.join(root, "src"), routeFile).replaceAll(path.sep, "/").replace(/\/route\.ts$/, "");\n  const base = rel.startsWith("app/api/") ? "/api/" + rel.slice(8) : "/" + rel.replace(/^app\//, "");\n  return base.replace(/\[\.\.\.([^\]]+)\]/g, "*__$1").replace(/\[([^\]]+)\]/g, ":$1").replace(/\*__[^/]+/g, "*");\n}\nfunction registerMethod(pathname: string, method: string, handler: any) {\n  (app as any)[method.toLowerCase()](pathname, async (req: express.Request, res: express.Response) => {\n    try {\n      const body = await readBody(req);\n      const webReq = toWebRequest(req, body);\n      const result = await requestContext.run({ req, res }, () => handler(webReq, { params: Promise.resolve(req.params) }));\n      if (!(result instanceof Response)) return res.status(200).json(result ?? { ok: true });\n      res.status(result.status); result.headers.forEach((v, k) => res.setHeader(k, v));\n      const setCookie = (result.headers as any).getSetCookie?.(); if (setCookie?.length) res.setHeader("Set-Cookie", setCookie);\n      const buf = Buffer.from(await result.arrayBuffer()); if (buf.length) res.end(buf); else res.end();\n    } catch (e) { console.error(e); res.status(500).json({ error: (e as Error).message || "Internal server error" }); }\n  });\n}\n\nconst routesRoot = path.join(root, "src", "app");\nfor (const file of collectRoutes(routesRoot)) {\n  const mod = await import(pathToFileURL(file).href);\n  const pathname = expressPath(file);\n  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) if (typeof mod[method] === "function") registerMethod(pathname, method, mod[method]);\n}\napp.get("/api/health", (_req, res) => res.json({ ok: true }));\napp.listen(5000, () => console.log("Express API running at http://localhost:5000"));\n`);

// Update package.json from the original dependencies, keeping Prisma/SQLite but removing Next/Bun-only packages.
const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
delete pkg.dependencies.next; delete pkg.dependencies['next-auth']; delete pkg.dependencies['next-intl']; delete pkg.dependencies['z-ai-web-dev-sdk'];
delete pkg.devDependencies['bun-types']; delete pkg.devDependencies['eslint-config-next'];
pkg.scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview', server: 'tsx server/server.ts', 'db:generate': 'prisma generate', 'db:push': 'prisma db push', 'db:seed': 'tsx scripts/seed.ts', lint: 'eslint .'};
pkg.dependencies.express = '^5.1.0'; pkg.dependencies.cors = '^2.8.5'; pkg.dependencies['tsx'] = '^4.19.4'; pkg.dependencies.vite = '^7.1.3'; pkg.devDependencies['@vitejs/plugin-react'] = '^5.0.2';
writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

writeFileSync(join(project, '.env.example'), `DATABASE_URL="file:./dev.db"\nSESSION_SECRET="change-this-in-production"\n`);
writeFileSync(join(project, 'README.md'), `# Kaliachak Abasik Mission — Smart School Portal\n\nSame application UI, modules, API contracts, Prisma schema, seed data and assets as the original project, migrated from Next.js/Bun to Vite/npm with an Express compatibility server.\n\n## Stack\n- React + Vite\n- Node.js + Express\n- Prisma + SQLite\n- npm\n\n## Run\n\n\`\`\`bash\nnpm install\nnpm run db:generate\nnpm run db:push\nnpm run db:seed\n\`\`\`\n\nTerminal 1:\n\`\`\`bash\nnpm run server\n\`\`\`\n\nTerminal 2:\n\`\`\`bash\nnpm run dev\n\`\`\`\n\nOpen http://localhost:5173\n`);

rmSync(source, { recursive: true, force: true });
