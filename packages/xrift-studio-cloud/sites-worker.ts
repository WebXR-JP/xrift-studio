/** Deploy only behind Sites' authenticated dispatcher, which owns these identity headers. */
import { handleMcp, type Environment } from './worker';
type Bindings = Omit<Environment, 'authenticate'>;
export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') {
      return handleMcp(request, {
        ...env,
        authenticate: async (incoming) => incoming.headers.get('oai-authenticated-user-id'),
      });
    }
    return env.ASSETS.fetch(request);
  },
};
