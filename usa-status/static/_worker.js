export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // For /down endpoint, fetch from origin and preserve status code
    if (url.pathname === '/down') {
      const response = await env.ASSETS.fetch(request);
      
      // Return response with original status code
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }
    
    // Default behavior for all other routes
    return env.ASSETS.fetch(request);
  }
}