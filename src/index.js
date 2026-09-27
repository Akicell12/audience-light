import { DurableObject } from "cloudflare:workers";

export class AudienceRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket接続
    if (url.pathname === "/ws") {
      const upgrade = request.headers.get("Upgrade");

      if (upgrade !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }

      const room = url.searchParams.get("room");

      if (!room) {
        return new Response("room required", { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("AudienceRoom OK");
  }

  async webSocketMessage(ws, message) {
    // 受信したメッセージを全接続へ送信
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch (e) {
        // 切断済みなら無視
      }
    }
  }

  async webSocketClose(ws) {
    // Cloudflare側で接続を管理するので特別な処理は不要
  }

  async webSocketError(ws, error) {
    // エラー時も特別な処理は不要
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /room/○○/ws
    if (url.pathname.startsWith("/room/")) {
      const room = url.pathname.split("/")[2];

      if (!room) {
        return new Response("Room required", { status: 400 });
      }

      const id = env.AUDIENCE_ROOM.idFromName(room);
      const stub = env.AUDIENCE_ROOM.get(id);

      const newUrl = new URL(request.url);
      newUrl.pathname = "/ws";
      newUrl.searchParams.set("room", room);

      return stub.fetch(new Request(newUrl, request));
    }

    return new Response("Audience Control Worker OK");
  }
};
