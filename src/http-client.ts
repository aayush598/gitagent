import { Agent, setGlobalDispatcher } from "undici";

export function configureHttpClient(): void {
  const agent = new Agent({
    connections: 50,
    keepAliveTimeout: 60000,
    keepAliveMaxTimeout: 300000,
    keepAliveTimeoutThreshold: 1000,
  });
  setGlobalDispatcher(agent);
}
