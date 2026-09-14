import { getStore } from '@netlify/blobs';

export default async (request) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[a-z0-9]{20}$/i.test(id)) return new Response('Not Found', { status: 404 });
  const project = await getStore('monstera-projects').get(id, { type: 'json' });
  if (!project) return new Response('Not Found', { status: 404 });
  const base = new URL('/.netlify/functions/get-photo', request.url);
  project.photos = (project.photos || []).map(photo => {
    if (photo.key) return { ...photo, url: `${base}?project=${encodeURIComponent(id)}&key=${encodeURIComponent(photo.key)}` };
    if (photo.url) return { ...photo, url: `${base}?url=${encodeURIComponent(photo.url)}` };
    return photo;
  });
  return Response.json(project, { headers: { 'Cache-Control': 'public, max-age=60' } });
};
