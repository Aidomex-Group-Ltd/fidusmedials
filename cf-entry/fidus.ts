// Fidus Workers entry point — SPA + proxy to backend Worker.
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Proxy /api/* to the backend Worker (fidus-backend).
    if (url.pathname.startsWith('/api/')) {
      const backendUrl = `https://fidus-backend.aidomexgroupltd.workers.dev${url.pathname}`;
      return fetch(backendUrl, request);
    }

    return new Response('Not found', { status: 404 });
  },
};
