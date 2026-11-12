// Realtime event bus: every connected socket is keyed by user id. Events are
// addressed to users, never broadcast blindly, so the partner never sees the
// handover code and anonymous customers stay anonymous.
import type { WebSocket } from 'ws';
import type { OrderEvent } from '@getme/core';

export class Bus {
  private sockets = new Map<string, Set<WebSocket>>();
  attach(userId: string, ws: WebSocket) {
    if (!this.sockets.has(userId)) this.sockets.set(userId, new Set());
    this.sockets.get(userId)!.add(ws);
    ws.on('close', () => { this.sockets.get(userId)?.delete(ws); });
  }
  send(userId: string, ev: OrderEvent) {
    const set = this.sockets.get(userId); if (!set) return;
    const payload = JSON.stringify(ev);
    for (const ws of set) { try { if (ws.readyState === 1) ws.send(payload); } catch { /* ignore */ } }
  }
  sendMany(userIds: Iterable<string>, ev: OrderEvent) { for (const id of new Set(userIds)) this.send(id, ev); }
  online(userId: string) { return (this.sockets.get(userId)?.size ?? 0) > 0; }
}
