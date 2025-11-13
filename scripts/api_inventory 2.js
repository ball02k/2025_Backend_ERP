#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

process.env.JEST_WORKER_ID = process.env.JEST_WORKER_ID || '1';
const app = require('../index.cjs');

function layerPath(regexp) {
  if (!regexp) return '';
  let str = regexp.toString();
  str = str.replace('/^\\', '/');
  str = str.replace('\\/?(?=\\/|$)/i', '');
  str = str.replace('(?=\\/|$)', '');
  str = str.replace(/\\\//g, '/');
  str = str.replace('^', '').replace('$', '');
  return str;
}

function resolveHandlerFile(fn) {
  for (const id of Object.keys(require.cache)) {
    const mod = require.cache[id];
    const exp = mod.exports;
    if (exp === fn) return id;
    if (typeof exp === 'object') {
      for (const key of Object.keys(exp)) {
        const desc = Object.getOwnPropertyDescriptor(exp, key);
        if (desc && typeof desc.value === 'function' && desc.value === fn) {
          return id + '#' + key;
        }
      }
    }
  }
  return null;
}


function parseStack(stack, prefix = '') {
  const routes = [];
  stack.forEach((layer) => {
    if (layer.route) {
      const routePath = prefix + (layer.route.path === '/' ? '' : layer.route.path);
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      const mws = layer.route.stack.map((l) => l.name || 'anonymous');
      const controllerLayer = layer.route.stack[layer.route.stack.length - 1];
      const handler = controllerLayer.handle || controllerLayer;
      const controllerName = handler.name || 'anonymous';
      const controllerFile = resolveHandlerFile(handler);
      const hasRequireAuth = mws.includes('requireAuth');
      const hasGuard = mws.some((n) => /assert.*Member|membership|rbac|role/i.test(n));
      const hasAttachUser = mws.includes('attachUser');
      const pathParams = (routePath.match(/:([^/]+)/g) || []).map((p) => p.slice(1));
      const source = handler.toString();
      const keywords = ['tenantId','projectId','variationId','status','limit','offset','sort','q','page'];
      const inferred = {};
      keywords.forEach((k) => { if (source.includes(k)) inferred[k] = true; });
      routes.push({
        path: routePath,
        methods,
        middlewares: mws,
        controller: { name: controllerName, file: controllerFile },
        hasRequireAuth,
        hasGuard,
        hasAttachUser,
        pathParams,
        inferred,
      });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const newPrefix = prefix + layerPath(layer.regexp);
      routes.push(...parseStack(layer.handle.stack, newPrefix));
    }
  });
  return routes;
}

function collectRoutes() {
  const stack = app._router && app._router.stack ? app._router.stack : [];
  return parseStack(stack, '');
}

function writeMarkdown(routes) {
  const sha = execSync('git rev-parse --short HEAD').toString().trim();
  const utc = new Date().toISOString();
  const london = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'long' }).format(new Date());
  let md = '# API Catalog\n\n';
  md += `Generated: ${utc} (UTC) / ${london} (Europe/London)\n\n`;
  md += `Commit: ${sha}\n\n`;
  md += '## Reminders\n\n';
  md += '- JWT HS256 required on all protected routes.\n';
  md += '- Tenant scoping required on every Prisma call.\n';
  md += '- BigInt serialization: Document.id/documentId rendered as strings in JSON.\n';
  md += '- No Prisma enums; use strings.\n';
  md += '- Prisma & @prisma/client versions must match (6.14.0).\n\n';
  md += '### Contributing\n\n';
  md += 'Any time a new route is added, run `npm run api:catalog` and commit the updated files.\n\n';

  routes.forEach((r) => {
    r.methods.forEach((method) => {
      md += `### ${method} ${r.path}\n\n`;
      md += `- Middlewares: ${r.middlewares.join(', ')}\n`;
      md += `- Controller: ${r.controller.name}${r.controller.file ? ` (${r.controller.file})` : ''}\n`;
      const guards = [];
      if (r.hasRequireAuth) guards.push('requireAuth');
      if (r.hasGuard) guards.push('guard');
      md += `- Auth/Guards: ${guards.join(', ') || 'none'}\n`;
      md += `- Path params: ${r.pathParams.join(', ') || 'none'}\n`;
      const lint = [];
      if (!r.hasRequireAuth) lint.push('Missing requireAuth');
      if (!('tenantId' in r.inferred)) lint.push('Missing tenant scoping');
      md += `- Lint: ${lint.length ? lint.join('; ') : 'OK'}\n\n`;
    });
  });

  fs.writeFileSync(path.join(__dirname, '..', 'API_CATALOG.md'), md);
}

function writeOpenAPI(routes) {
  const sha = execSync('git rev-parse --short HEAD').toString().trim();
  const doc = {
    openapi: '3.0.0',
    info: { title: 'API', version: sha },
    paths: {},
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
  const inferExample = (r, method) => {
    const isGet = method.toUpperCase() === 'GET';
    const isPost = method.toUpperCase() === 'POST';
    const isPut = method.toUpperCase() === 'PUT';
    const isPatch = method.toUpperCase() === 'PATCH';
    const isDelete = method.toUpperCase() === 'DELETE';
    const isSingle = r.pathParams && r.pathParams.length > 0; // heuristic
    if (isGet && !isSingle) {
      return { total: 1, items: [{ id: 1, _example: true }] };
    }
    if (isGet && isSingle) {
      return { id: 1, _example: true };
    }
    if (isPost) {
      return { id: 101, created: true };
    }
    if (isPut || isPatch) {
      return { id: 1, updated: true };
    }
    if (isDelete) {
      return { ok: true };
    }
    return { ok: true };
  };
  routes.forEach((r) => {
    const pathKey = r.path.replace(/:([^/]+)/g, '{$1}');
    if (!doc.paths[pathKey]) doc.paths[pathKey] = {};
    r.methods.forEach((method) => {
      const params = r.pathParams.map((p) => ({ name: p, in: 'path', required: true, schema: { type: 'number' } }));
      const okExample = inferExample(r, method);
      const responses = {
        200: {
          description: 'OK',
          content: { 'application/json': { example: okExample } },
        },
      };
      if (r.hasRequireAuth) {
        responses[401] = {
          description: 'Unauthorized',
          content: { 'application/json': { example: { error: 'Unauthorized' } } },
        };
        responses[403] = {
          description: 'Forbidden',
          content: { 'application/json': { example: { error: { code: 'FORBIDDEN', message: 'Forbidden' } } } },
        };
      }
      const obj = { summary: `${method} ${r.path}`, parameters: params, responses };
      if (r.hasRequireAuth) obj.security = [{ bearerAuth: [] }];
      doc.paths[pathKey][method.toLowerCase()] = obj;
    });
  });
  fs.writeFileSync(path.join(__dirname, '..', 'openapi-lite.json'), JSON.stringify(doc, null, 2));
}

function main() {
  const routes = collectRoutes();
  if (process.argv.includes('--write-md')) writeMarkdown(routes);
  if (process.argv.includes('--write-openapi')) writeOpenAPI(routes);
  if (!process.argv.includes('--write-md') && !process.argv.includes('--write-openapi')) {
    console.log(routes);
  }
}

main();
