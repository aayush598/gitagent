import { Agent, setGlobalDispatcher } from "undici";

export function configureHttpClient(): void {
  const agent = new Agent({
    connections: 100,
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 300000,
  });
  setGlobalDispatcher(agent);
}
