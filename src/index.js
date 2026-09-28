// @ts-nocheck

import { DurableObject } from "cloudflare:workers";


/* =========================================================
 * デフォルト設定
 * ========================================================= */

const DEFAULT_SETTINGS = {
    colors: [
        "#ff0000",
        "#00ff00",
        "#0000ff",
        "#ffffff"
    ],

    blink: {
        bpm: 120,
        pattern: [1, 0, 1, 0]
    }
};


/* =========================================================
 * Durable Object
 * ========================================================= */

export class AudienceRoom extends DurableObject {

    async fetch(request) {

        const url = new URL(request.url);

        if (url.pathname === "/ws") {

            if (
                request.headers.get("Upgrade") !== "websocket"
            ) {
                return new Response(
                    "WebSocket required",
                    { status: 426 }
                );
            }

            const room =
                url.searchParams.get("room");

            if (!room) {

                return new Response(
                    "room required",
                    { status: 400 }
                );

            }

            const pair =
                new WebSocketPair();

            const [client, server] =
                Object.values(pair);

            this.ctx.acceptWebSocket(server);

            this.broadcastCount();

            // 接続したコンソール・スマホへ
            // 現在の設定を送る
            const settings =
                await this.getSettings();

            try {

                server.send(
                    JSON.stringify({
                        type: "settings",
                        settings
                    })
                );

            } catch (e) {}

            return new Response(
                null,
                {
                    status: 101,
                    webSocket: client
                }
            );
        }

        return new Response(
            "AudienceRoom OK"
        );
    }


    /* =====================================================
     * 設定取得
     * ===================================================== */

    async getSettings() {

        let settings =
            await this.ctx.storage.get("settings");

        if (!settings) {

            settings =
                structuredClone(
                    DEFAULT_SETTINGS
                );

            await this.ctx.storage.put(
                "settings",
                settings
            );

            return settings;
        }


        // 古い設定を修復

        if (
            !Array.isArray(settings.colors)
        ) {

            settings.colors =
                DEFAULT_SETTINGS.colors.slice();

        }


        if (!settings.blink) {

            settings.blink =
                structuredClone(
                    DEFAULT_SETTINGS.blink
                );

        }


        if (
            !Number.isFinite(
                settings.blink.bpm
            )
        ) {

            settings.blink.bpm = 120;

        }


        if (
            !Array.isArray(
                settings.blink.pattern
            )
        ) {

            settings.blink.pattern =
                [1, 0, 1, 0];

        }


        await this.ctx.storage.put(
            "settings",
            settings
        );

        return settings;
    }


    /* =====================================================
     * WebSocket受信
     * ===================================================== */

    async webSocketMessage(
        ws,
        message
    ) {

        let data;

        try {

            data =
                JSON.parse(message);

        } catch (e) {

            // JSONではない場合はそのまま転送
            this.broadcast(message);
            return;
        }


        /* -------------------------------------------------
         * 設定取得
         * ------------------------------------------------- */

        if (
            data.type === "getSettings"
        ) {

            const settings =
                await this.getSettings();

            try {

                ws.send(
                    JSON.stringify({
                        type: "settings",
                        settings
                    })
                );

            } catch (e) {}

            return;
        }


        /* -------------------------------------------------
         * カラー保存
         * ------------------------------------------------- */

        if (
            data.type === "saveColor"
        ) {

            const color =
                String(data.color || "")
                    .trim()
                    .toLowerCase();


            // HEXチェック
            if (
                !/^#[0-9a-f]{6}$/i.test(
                    color
                )
            ) {

                return;
            }


            const settings =
                await this.getSettings();


            if (
                !settings.colors.includes(color)
            ) {

                settings.colors.push(color);
            }


            // 保存数を制限
            // 必要なら後で変更可能
            if (
                settings.colors.length > 20
            ) {

                settings.colors =
                    settings.colors.slice(-20);

            }


            await this.ctx.storage.put(
                "settings",
                settings
            );


            // 全端末へ設定更新
            this.broadcast(
                JSON.stringify({
                    type: "settings",
                    settings
                })
            );

            return;
        }


        /* -------------------------------------------------
         * 点滅設定保存
         * ------------------------------------------------- */

        if (
            data.type === "saveBlink"
        ) {

            let bpm =
                Number(data.bpm);


            if (
                !Number.isFinite(bpm)
            ) {

                bpm = 120;
            }


            bpm =
                Math.max(
                    20,
                    Math.min(
                        300,
                        Math.round(bpm)
                    )
                );


            let pattern =
                Array.isArray(
                    data.pattern
                )
                    ? data.pattern
                        .slice(0, 16)
                        .map(
                            value =>
                                value ? 1 : 0
                        )
                    : [1, 0, 1, 0];


            if (pattern.length === 0) {

                pattern =
                    [1, 0, 1, 0];

            }


            const settings =
                await this.getSettings();


            settings.blink = {
                bpm,
                pattern
            };


            await this.ctx.storage.put(
                "settings",
                settings
            );


            // 全端末へ設定更新
            this.broadcast(
                JSON.stringify({
                    type: "settings",
                    settings
                })
            );

            return;
        }


        /* -------------------------------------------------
         * 通常コマンド
         *
         * color
         * blink
         * clear
         * ------------------------------------------------- */

        this.broadcast(
            JSON.stringify(data)
        );
    }


    /* =====================================================
     * 全WebSocketへ送信
     * ===================================================== */

    broadcast(message) {

        for (
            const socket of
            this.ctx.getWebSockets()
        ) {

            try {

                socket.send(message);

            } catch (e) {}

        }
    }


    /* =====================================================
     * 接続人数
     * ===================================================== */

    async webSocketClose(ws) {

        this.broadcastCount();
    }


    async webSocketError(
        ws,
        error
    ) {

        this.broadcastCount();
    }


    broadcastCount() {

        const count =
            this.ctx
                .getWebSockets()
                .length;


        const message =
            JSON.stringify({
                type: "count",
                count
            });


        this.broadcast(message);
    }
}


/* =========================================================
 * Worker
 * ========================================================= */

export default {

    async fetch(
        request,
        env
    ) {

        const url =
            new URL(request.url);


        if (
            url.pathname.startsWith("/room/")
        ) {

            const room =
                url.pathname
                    .split("/")[2];


            if (!room) {

                return new Response(
                    "Room required",
                    { status: 400 }
                );

            }


            const id =
                env.AUDIENCE_ROOM
                    .idFromName(room);


            const stub =
                env.AUDIENCE_ROOM
                    .get(id);


            const newUrl =
                new URL(request.url);


            newUrl.pathname = "/ws";

            newUrl.searchParams.set(
                "room",
                room
            );


            return stub.fetch(
                new Request(
                    newUrl,
                    request
                )
            );
        }


        return new Response(
            "Audience Control Worker OK"
        );
    }
};
