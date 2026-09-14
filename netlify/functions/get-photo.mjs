import { getStore } from '@netlify/blobs';

export default async (request) => {
  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  const key = url.searchParams.get('key');
  const remote = url.searchParams.get('url');
  if (remote) {
    let target;
    try { target = new URL(remote); } catch { return new Response('Not Found', { status: 404 }); }
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.supabase.co') || !target.pathname.startsWith('/storage/v1/object/public/')) return new Response('Not Found', { status: 404 });
    const upstream = await fetch(target);
    if (!upstream.ok || !upstream.body) return new Response('Not Found', { status: upstream.status || 404 });
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  }
  if (!project || !key || !key.startsWith(`${project}/`)) return new Response('Not Found', { status: 404 });
  const blob = await getStore('monstera-assets').get(key, { type: 'blob' });
  if (!blob) return new Response('Not Found', { status: 404 });
  return new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
};
