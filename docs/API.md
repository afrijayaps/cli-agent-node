# API Reference

Base URL: `http://<host>:8000`

Semua response JSON.

## 1) Health

### `GET /health`

Response `200`:

```json
{ "status": "ok" }
```

## 2) Legacy Ask Endpoint

### `POST /ask`

Digunakan untuk kompatibilitas endpoint lama.

Request body:

```json
{
  "prompt": "text",
  "provider": "codex|claude|antigravity|ollama"
}
```

Catatan:

- `provider` opsional.
- Jika `provider` tidak dikirim/kosong, otomatis pakai default `codex`.

Success `200`:

```json
{ "result": "output AI" }
```

Validation error `400`:

```json
{ "error": "Validation error", "details": "..." }
```

CLI failure `502`:

```json
{
  "error": "CLI provider execution failed",
  "provider": "codex",
  "code": 127,
  "details": "CLI executable not found in PATH."
}
```

Internal error `500`:

```json
{ "error": "Internal server error" }
```

## 3) Meta

### `GET /api/meta`

Success `200`:

```json
{
  "providers": ["codex", "claude", "antigravity", "ollama"],
  "defaultProvider": "codex",
  "themes": [
    { "id": "aether", "name": "Aether Mint", "description": "..." },
    { "id": "slate", "name": "Slate Console", "description": "..." },
    { "id": "ember", "name": "Ember Signal", "description": "..." }
  ],
  "settings": {
    "theme": "aether",
    "masterProjectRoot": "/www/wwwroot"
  },
  "authMode": "cli"
}
```

## 4) Theme / Settings

### `GET /api/themes`

Success `200`:

```json
{
  "themes": [{ "id": "aether", "name": "Aether Mint", "description": "..." }],
  "currentTheme": "aether"
}
```

### `GET /api/settings`

Success `200`:

```json
{
  "theme": "aether",
  "masterProjectRoot": "/www/wwwroot"
}
```

### `PUT /api/settings`

Request:

```json
{
  "theme": "slate",
  "masterProjectRoot": "/www/wwwroot"
}
```

Success `200`:

```json
{
  "theme": "slate",
  "masterProjectRoot": "/www/wwwroot",
  "systemPrompt": "Selalu jawab bahasa Indonesia ringkas."
}
```

Validation error `400`:

```json
{ "error": "Validation error", "details": "theme is not supported." }
```

Contoh update master root:

```json
{ "masterProjectRoot": "/www/wwwroot" }
```

Jika path tidak valid/tidak ada/bukan direktori -> `400`.

## 5) Projects

### `GET /api/projects`

Catatan:

- Endpoint ini otomatis melakukan sync project dari subfolder level-1 di `masterProjectRoot`.
- Hanya folder yang memang ada di bawah `masterProjectRoot` yang akan ditampilkan.

Success `200`:

```json
{
  "projects": [
    {
      "id": "cli-agent-node--www-wwwroot-cli-agent-node",
      "name": "CLI Agent Node",
      "projectPath": "/www/wwwroot/.cli-agent-node",
      "createdAt": "2026-03-12T14:05:20.806Z",
      "updatedAt": "2026-03-12T14:05:20.871Z"
    }
  ],
  "masterProjectRoot": "/www/wwwroot"
}
```

### `POST /api/projects`

Request:

```json
{
  "name": "CLI Agent Node",
  "projectPath": "/www/wwwroot/.cli-agent-node"
}
```

Success `201`:

```json
{
  "project": {
    "id": "cli-agent-node--www-wwwroot-cli-agent-node",
    "name": "CLI Agent Node",
    "projectPath": "/www/wwwroot/.cli-agent-node",
    "createdAt": "2026-03-12T14:05:20.806Z",
    "updatedAt": "2026-03-12T14:05:20.806Z"
  }
}
```

Validation error `400`, duplicate `409`.

Catatan:

- `projectPath` wajib berada di dalam `masterProjectRoot`.
- Untuk UI standar, endpoint ini biasanya tidak dipakai langsung karena project dibuat otomatis dari hasil scan folder.

## 6) Sessions

### `GET /api/projects/:projectId/sessions`

Success `200`:

```json
{
  "sessions": [
    {
      "id": "s-mmnjij4b-b4olx1",
      "title": "First persistent chat",
      "createdAt": "2026-03-12T14:05:20.843Z",
      "updatedAt": "2026-03-12T14:05:20.870Z",
      "messageCount": 1
    }
  ]
}
```

### `POST /api/projects/:projectId/sessions`

Request:

```json
{ "title": "Diskusi fitur tema" }
```

`title` opsional.

Success `201`:

```json
{
  "session": {
    "id": "s-xxxx",
    "projectId": "cli-agent-node--www-wwwroot-cli-agent-node",
    "title": "Diskusi fitur tema",
    "createdAt": "2026-03-12T14:05:20.843Z",
    "updatedAt": "2026-03-12T14:05:20.843Z",
    "messages": []
  }
}
```

### `GET /api/projects/:projectId/sessions/:sessionId`

Success `200`:

```json
{
  "session": {
    "id": "s-xxxx",
    "projectId": "cli-agent-node--www-wwwroot-cli-agent-node",
    "title": "Diskusi fitur tema",
    "createdAt": "2026-03-12T14:05:20.843Z",
    "updatedAt": "2026-03-12T14:06:15.113Z",
    "messages": [
      {
        "id": "m-xxxx",
        "role": "user",
        "provider": "codex",
        "content": "buatkan ringkasan",
        "createdAt": "2026-03-12T14:06:00.000Z"
      }
    ]
  }
}
```

## 7) Ask di Dalam Session

### `POST /api/projects/:projectId/sessions/:sessionId/ask`

Request:

```json
{
  "prompt": "balas kata: siap",
  "provider": "codex"
}
```

Catatan:

- `provider` opsional, default `codex`.
- Message user akan tetap disimpan ke session walaupun provider gagal.

Success `200`:

```json
{
  "result": "siap",
  "session": {
    "id": "s-xxxx",
    "projectId": "cli-agent-node--www-wwwroot-cli-agent-node",
    "title": "Diskusi fitur tema",
    "createdAt": "2026-03-12T14:05:20.843Z",
    "updatedAt": "2026-03-12T14:06:20.000Z",
    "messages": []
  }
}
```

CLI failure `502`, validation `400`, not found `404`, internal `500`.
