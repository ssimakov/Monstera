import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const indexFile = path.join(root, 'dist', 'index.html');
// Keep the old Netlify deployment as a temporary data/API source during migration.
// Do not use monstera.icu here: after the custom domain moves to Layero, that would recurse.
const legacyBase = process.env.LEGACY_API_BASE || 'https://sparkly-blancmange-c9f25.netlify.app';
const port = Number(process.env.PORT || 3000);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function localPhotoUrl(req, photo, projectId) {
  const base = new URL('/.netlify/functions/get-photo', `http://${req.headers.host}`);
  if (photo.key) {
    base.searchParams.set('project', projectId);
    base.searchParams.set('key', photo.key);
    return base.toString();
  }
  if (!photo.url) return photo.url;

  try {
    const old = new URL(photo.url);
    const nested = old.searchParams.get('url');
    if (nested) base.searchParams.set('url', nested);
    else {
      const oldProject = old.searchParams.get('project');
      const oldKey = old.searchParams.get('key');
      if (oldProject && oldKey) {
        base.searchParams.set('project', oldProject);
        base.searchParams.set('key', oldKey);
      } else base.searchParams.set('url', photo.url);
    }
  } catch {
    base.searchParams.set('url', photo.url);
  }
  return base.toString();
}

async function getProject(req, res, parsed) {
  const upstreamUrl = new URL('/.netlify/functions/get-project', legacyBase);
  upstreamUrl.search = parsed.search;
  const upstream = await fetch(upstreamUrl);
  const text = await upstream.text();
  if (!upstream.ok) return send(res, upstream.status, text, { 'Content-Type': upstream.headers.get('content-type') || 'text/plain' });

  const project = JSON.parse(text);
  const projectId = parsed.searchParams.get('id');
  project.photos = (project.photos || []).map(photo => ({
    ...photo,
    url: localPhotoUrl(req, photo, projectId)
  }));
  return send(res, 200, JSON.stringify(project), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60'
  });
}

function allowedRemote(target) {
  return target.protocol === 'https:' && (
    target.hostname.endsWith('.supabase.co') ||
    target.hostname === 'monstera.icu' ||
    target.hostname.endsWith('.netlify.app')
  );
}

async function getPhoto(res, parsed) {
  let upstreamUrl;
  const remote = parsed.searchParams.get('url');
  if (remote) {
    try { upstreamUrl = new URL(remote); } catch { return send(res, 404, 'Not Found'); }
  } else {
    upstreamUrl = new URL('/.netlify/functions/get-photo', legacyBase);
    upstreamUrl.search = parsed.search;
  }
  if (!allowedRemote(upstreamUrl)) return send(res, 404, 'Not Found');

  const upstream = await fetch(upstreamUrl);
  if (!upstream.ok || !upstream.body) return send(res, upstream.status || 404, 'Not Found');
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}

async function proxyFunction(req, res, parsed, name) {
  const target = new URL(`/.netlify/functions/${name}`, legacyBase);
  target.search = parsed.search;
  const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
  const upstream = await fetch(target, { method: req.method, headers, body });
  const text = await upstream.text();
  return send(res, upstream.status, text, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
}

async function handler(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (parsed.pathname === '/.netlify/functions/get-project') return getProject(req, res, parsed);
    if (parsed.pathname === '/.netlify/functions/get-photo') return getPhoto(res, parsed);
    if (parsed.pathname === '/.netlify/functions/create-project') return proxyFunction(req, res, parsed, 'create-project');

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    const html = await fs.readFile(indexFile);
    return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  } catch (error) {
    console.error(error);
    return send(res, 502, 'Upstream service unavailable');
  }
}

http.createServer(handler).listen(port, '0.0.0.0', () => {
  console.log(`Monstera is listening on port ${port}`);
});
