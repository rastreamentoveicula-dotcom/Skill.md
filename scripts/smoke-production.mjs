#!/usr/bin/env node
/**
 * Smoke de produção — verifica a saúde do deploy público.
 *
 * Uso:
 *   npm run smoke
 *   SMOKE_BASE_URL=https://outro-ambiente.example node scripts/smoke-production.mjs
 *
 * Não usa credenciais: só confere endpoints públicos e a parede de autenticação.
 * Roda em CI (job "smoke") ou na máquina do desenvolvedor. Saída 0 = tudo ok.
 */

const BASE = (process.env.SMOKE_BASE_URL ?? 'https://motion-system-eta.vercel.app').replace(/\/$/, '');
const TIMEOUT_MS = 20_000;
const RETRIES = 2;

/** @type {Array<{ name: string, path: string, method?: string, expectStatus: number, expectBody?: (body, text) => string | null }>} */
const CHECKS = [
  {
    name: 'Página inicial responde',
    path: '/',
    expectStatus: 200,
  },
  {
    name: 'Health check do banco',
    path: '/api/health?fresh=1',
    expectStatus: 200,
    expectBody: (body) => (body && body.status === 'ok' && body.db === 'ok' ? null : `esperava {status:ok, db:ok}, veio ${JSON.stringify(body)}`),
  },
  {
    name: 'Configurações de IA exigem login',
    path: '/api/admin/settings/ai',
    expectStatus: 401,
  },
  {
    name: 'Projetos exigem login',
    path: '/api/projects',
    expectStatus: 401,
  },
  {
    name: 'Biblioteca de sons exige login',
    path: '/api/sound-effects',
    expectStatus: 401,
  },
];

async function request(check) {
  const url = BASE + check.path;
  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: check.method ?? 'GET',
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept: 'application/json,text/html' },
      });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        // corpo não-JSON é aceitável para páginas HTML
      }
      return { ok: true, status: response.status, body, text };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError };
}

let failures = 0;
console.log(`Smoke de produção em ${BASE}\n`);

for (const check of CHECKS) {
  const result = await request(check);
  if (!result.ok) {
    failures += 1;
    console.log(`✗ ${check.name} — falha de rede: ${result.error?.message ?? 'desconhecida'}`);
    continue;
  }
  const statusOk = result.status === check.expectStatus;
  const bodyProblem = statusOk && check.expectBody ? check.expectBody(result.body, result.text) : null;
  if (statusOk && !bodyProblem) {
    console.log(`✓ ${check.name} (${result.status})`);
  } else {
    failures += 1;
    const reason = bodyProblem ?? `esperava HTTP ${check.expectStatus}, veio ${result.status}`;
    console.log(`✗ ${check.name} — ${reason}`);
  }
}

console.log('');
if (failures > 0) {
  console.log(`SMOKE_FAIL: ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('SMOKE_OK: todos os pontos de verificação passaram.');
