import { DurableObject } from "cloudflare:workers";

export class AudienceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async fetch(request) {
    return new Response("AudienceRoom OK");
  }
}

export default {
  async fetch(request, env) {
    return new Response("Worker OK");
  }
};
