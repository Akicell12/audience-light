import { DurableObject } from "cloudflare:workers";

export class AudienceRoom extends DurableObject {

  async fetch(request) {

    const url = new URL(request.url);

    if (url.pathname === "/ws") {

      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket required", {
          status: 426
        });
      }

      const room = url.searchParams.get("room");

      if (!room) {
        return new Response("room required", {
          status: 400
        });
      }

      const pair = new WebSocketPair();

      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      this.broadcastCount();

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return new Response("AudienceRoom OK");
  }


  async webSocketMessage(ws, message) {

    // 受け取ったコマンドを全員へ送信
    for (const socket of this.ctx.getWebSockets()) {

      try {
        socket.send(message);
      } catch (e) {}

    }
  }


  async webSocketClose(ws) {

    this.broadcastCount();
  }


  async webSocketError(ws, error) {

    this.broadcastCount();
  }


  broadcastCount() {

    const count =
      this.ctx.getWebSockets().length;

    const message =
      JSON.stringify({
        type: "count",
        count: count
      });

    for (const socket of this.ctx.getWebSockets()) {

      try {
        socket.send(message);
      } catch (e) {}

    }
  }
}


export default {

  async fetch(request, env) {

    const url = new URL(request.url);


    /*
     * ルーム接続
     *
     * /room/TEST
     */

    if (url.pathname.startsWith("/room/")) {

      const room =
        url.pathname.split("/")[2];

      if (!room) {

        return new Response(
          "Room required",
          { status: 400 }
        );

      }


      const id =
        env.AUDIENCE_ROOM.idFromName(room);

      const stub =
        env.AUDIENCE_ROOM.get(id);


      const newUrl =
        new URL(request.url);

      newUrl.pathname = "/ws";

      newUrl.searchParams.set(
        "room",
        room
      );


      return stub.fetch(
        new Request(newUrl, request)
      );
    }


    return new Response(
      "Audience Control Worker OK"
    );
  }
};
