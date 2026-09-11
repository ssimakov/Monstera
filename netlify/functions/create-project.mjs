import { getStore } from '@netlify/blobs';

export default async (request) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  try {
    const form = await request.formData();
    const rawMeta = form.get('meta');
    const files = form.getAll('files').filter(item => item && typeof item.arrayBuffer === 'function');
    if (!rawMeta || !files.length) return new Response('Нужны метаданные и хотя бы одно фото', { status: 400, headers: cors });
    const meta = JSON.parse(rawMeta);
    if (files.length > 50) return new Response('Слишком много фото в одном проекте', { status: 413, headers: cors });
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
    const projectStore = getStore('monstera-projects');
    const assetStore = getStore('monstera-assets');
    const photos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = `${id}/${i}-${encodeURIComponent(file.name || 'photo.jpg')}`;
      await assetStore.set(key, file, { metadata: { contentType: file.type || 'image/jpeg' } });
      photos.push({ name: file.name || `Фото ${i + 1}`, folderId: meta.photos?.[i]?.folderId || 'general', key });
    }
    await projectStore.setJSON(id, { title: meta.title || 'Monstera 360', folders: meta.folders || [], photos, createdAt: new Date().toISOString() });
    return Response.json({ id }, { headers: cors });
  } catch (error) {
    console.error(error);
    return new Response('Ошибка публикации проекта', { status: 500, headers: cors });
  }
};
