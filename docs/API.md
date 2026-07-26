# APIs HostGator — Neve Selvagem v1.0

Base típica: `https://jhonatanribeiro.com/snow/api/`  
CORS: `Access-Control-Allow-Origin: *`  
Corpo: JSON (`Content-Type: application/json`)

---

## `leaderboard.php`

Persistência: `data/leaderboard.json` (protegido por `data/.htaccess`).

| Ação | Método | Notas |
| --- | --- | --- |
| Listar | GET / POST | Top scores |
| Enviar | POST | nome + `timeMs` após vitória |

Filtros no servidor/cliente rejeitam tempos absurdamente baixos e nomes lixo.

---

## `signal.php` (co-op)

Persistência: `data/rooms/{CODE}.json` (TTL 30 min).  
Ações: `ping` | `create` | `join` | `publish` | `poll` | `relay`

### `ping`

```json
{ "action": "ping" }
```

→ `{ "ok": true, "ping": true, "roomsWritable": true, "time": … }`

### `create`

```json
{ "action": "create", "seed": 12345 }
```

→ `{ "ok": true, "code": "ABC123", "seed": 12345, "role": "host" }`

### `join`

```json
{ "action": "join", "code": "ABC123" }
```

→ seed/código/`role: guest`.  
409 se a sala já tem guest com handshake completo (`answer` presente).  
Rejoin permitido se `guestJoined` sem `answer`.

### `publish`

Host: `offer` + ICE. Guest: `answer` + ICE.  
Opcional: `{ "relayMode": true }` para marcar fallback HTTPS.

### `poll`

Retorna offer/answer, ICE novos (`sinceHostIce` / `sinceGuestIce`), `relayMode`, e `relayMsgs` desde `sinceRelay` (exclui msgs do próprio `role`).

### `relay`

```json
{
  "action": "relay",
  "code": "ABC123",
  "role": "host",
  "messages": [{ "t": "pose", "x": 1, "y": 0, "z": 2 }]
}
```

Fila limitada (~60 msgs). Usado quando WebRTC falha (firewall/NAT).

Smoke: `node tests/coop-relay-smoke.mjs`

---

## `tickets.php`

Persistência: `data/tickets.json`  
Admin: `data/tickets-admin.key` (1 linha) **ou** constante no PHP (placeholder rejeitado).

### Público

- **GET** — lista tickets (filtros `type`, `status` opcionais)  
- **POST create** — `{ "action": "create", "type": "feature"|"bug", "title", "body", "name?" }`

### Admin

```json
{
  "action": "status",
  "id": "…",
  "status": "open"|"doing"|"done"|"wontfix",
  "adminKey": "…"
}
```

UI: `/tickets/` (board estilo Jira).

---

## Dados no servidor — nunca apagar no deploy

| Arquivo / pasta | Conteúdo |
| --- | --- |
| `data/leaderboard.json` | ranking |
| `data/tickets.json` | sugestões |
| `data/tickets-admin.key` | senha moderação (só servidor) |
| `data/rooms/` | salas co-op (efêmeras) |

Ver [`DEPLOY-SEGURO.md`](DEPLOY-SEGURO.md).
