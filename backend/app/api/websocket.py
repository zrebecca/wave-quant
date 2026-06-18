from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import hub

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    """Single multiplexed stream: tickers, orderbook, bot, log, notification."""
    await hub.connect(ws)
    try:
        while True:
            # We only push; ignore inbound but keep the socket alive.
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(ws)
    except Exception:
        await hub.disconnect(ws)
