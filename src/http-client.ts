import { Agent, setGlobalDispatcher } from "undici";

const DEFAULT_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT || "30000", 10);

export function configureHttpClient(): void {
  const agent = new Agent({
    connections: 100,
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 300000,
    headersTimeout: DEFAULT_TIMEOUT,
    bodyTimeout: DEFAULT_TIMEOUT,
  });
  setGlobalDispatcher(agent);
}
