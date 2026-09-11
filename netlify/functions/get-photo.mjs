import { getStore } from '@netlify/blobs';

export default async (request) => {
  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  const key = url.searchParams.get('key');
  if (!project || !key || !key.startsWith(`${project}/`)) return new Response('Not Found', { status: 404 });
  const blob = await getStore('monstera-assets').get(key, { type: 'blob' });
  if (!blob) return new Response('Not Found', { status: 404 });
  return new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
};
