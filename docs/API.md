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
  "provider": "codex|claude|antigravity|ollama",
  "model": "llama3:latest",
  "reasoning": "high",
  "mode": "plan"
}
```

Catatan:

- `provider` opsional.
- Jika `provider` tidak dikirim/kosong, otomatis pakai `aiPrimary` di settings.
- Jika primary gagal dan fallback diset, server mencoba fallback.
- `model`, `reasoning`, `mode` opsional, jika didukung provider.
- Nilai `reasoning`: `low`, `medium`, `high`, `xhigh` (default `medium`).
- Jika prompt diawali command `/status`, backend tidak memanggil provider dan langsung membalas status Codex saat ini.

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
    "masterProjectRoot": "/www/wwwroot",
    "aiPrimary": "codex",
    "aiFallback": "claude",
    "systemPrompt": "Kamu adalah asisten engineering. Jawab ringkas dan to the point."
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
  "masterProjectRoot": "/www/wwwroot",
  "aiPrimary": "codex",
  "aiFallback": "claude",
  "systemPrompt": "Kamu adalah asisten engineering. Jawab ringkas dan to the point."
}
```

### `PUT /api/settings`

Request:

```json
{
  "theme": "slate",
  "masterProjectRoot": "/www/wwwroot",
  "aiPrimary": "codex",
  "aiFallback": "claude",
  "systemPrompt": "Kamu adalah asisten engineering. Jawab ringkas dan to the point."
}
```

Success `200`:

```json
{
  "theme": "slate",
  "masterProjectRoot": "/www/wwwroot",
  "aiPrimary": "codex",
  "aiFallback": "claude",
  "systemPrompt": "Kamu adalah asisten engineering. Jawab ringkas dan to the point."
}
```

Validation error `400`:

```json
{ "error": "Validation error", "details": "theme is not supported." }
```

Validation error `400` (provider invalid):

```json
{ "error": "Validation error", "details": "aiPrimary must be a supported provider." }
```

### `GET /api/auth-status?provider=codex`

Success `200`:

```json
{
  "provider": "codex",
  "status": "logged_in",
  "details": "authenticated",
  "account": "chat.mbak.asri@gmail.com (Plus)",
  "model": "gpt-5.2-codex (reasoning low, summaries auto)",
  "session": "019ce5db-59a2-7453-8a55-cdb2c1ce821e",
  "limit5h": "[███████████████░░░░░] 75% left (resets 09:30)",
  "limitWeekly": "[██████░░░░░░░░░░░░░░] 32% left (resets 21:13 on 18 Mar)"
}
```

Possible `status` values:
- `logged_in`
- `logged_out`
- `cli_missing`
- `error`

Notes:
- Backend runs `printf "/status\n" | codex`.
- Jika output mengandung `unrecognized subcommand/unknown subcommand/unexpected argument`, status menjadi `error`.

Contoh update master root:

```json
{ "masterProjectRoot": "/www/wwwroot" }
```

Jika path tidak valid/tidak ada/bukan direktori -> `400`.

## 5) Jobs

### `GET /api/jobs`

Success `200`:

```json
{
  "jobs": [
    {
      "id": "job-abc123",
      "startedAt": "2026-03-13T10:00:00.000Z",
      "type": "session",
      "projectId": "cli-agent-node--www-wwwroot-cli-agent-node",
      "sessionId": "farm.asrijaya.com::a1b2c3",
      "provider": "codex",
      "fallbackProvider": "claude",
      "model": "gpt-4.1",
      "reasoning": "medium",
      "mode": "normal",
      "promptChars": 128
    }
  ],
  "count": 1
}
```

Catatan:

- `jobs` hanya berisi proses yang sedang berjalan.

### `POST /api/jobs/stop`

Best-effort untuk menghentikan semua job aktif (membatalkan request provider yang masih berjalan).

Success `200`:

```json
{ "stopped": 2, "total": 2 }
```

Jika tidak ada job aktif, `stopped` bisa `0`.

## 6) Models

### `GET /api/models?provider=:provider`

Success `200`:

```json
{
  "provider": "ollama",
  "models": ["llama3:latest", "deepseek-coder"],
  "source": "command"
}
```

Jika provider tidak menyediakan list model, `models` bisa kosong.

## 7) Projects

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

Error `400` (project di luar master root):

```json
{
  "error": "Validation error",
  "details": "projectPath must be inside masterProjectRoot. Please change masterProjectRoot in settings."
}
```

Validation error `400`, duplicate `409`.

Catatan:

- `projectPath` wajib berada di dalam `masterProjectRoot`.
- Untuk UI standar, endpoint ini biasanya tidak dipakai langsung karena project dibuat otomatis dari hasil scan folder.

## 8) Sessions

### `GET /api/projects/:projectId/sessions`

Success `200`:

```json
{
  "sessions": [
    {
      "id": "farm.asrijaya.com::a1b2c3",
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

Format `session.id`:
- `<folderProject>::<6-char>` (contoh: `farm.asrijaya.com::a1b2c3`), `folderProject` diambil dari nama folder project aktif.

Success `201`:

```json
{
  "session": {
    "id": "farm.asrijaya.com::a1b2c3",
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
    "id": "farm.asrijaya.com::a1b2c3",
    "projectId": "cli-agent-node--www-wwwroot-cli-agent-node",
    "title": "Diskusi fitur tema",
    "createdAt": "2026-03-12T14:05:20.843Z",
    "updatedAt": "2026-03-12T14:06:15.113Z",
    "preferences": {
      "model": "llama3:latest",
      "reasoning": "high",
      "mode": "plan"
    },
    "messages": [
      {
        "id": "m-xxxx",
        "role": "user",
        "provider": "codex",
        "content": "buatkan ringkasan",
        "model": "llama3:latest",
        "reasoning": "high",
        "mode": "plan",
        "createdAt": "2026-03-12T14:06:00.000Z"
      }
    ]
  }
}
```

## 9) Ask di Dalam Session

### `POST /api/projects/:projectId/sessions/:sessionId/ask`

Request:

```json
{
  "prompt": "balas kata: siap",
  "provider": "codex",
  "model": "llama3:latest",
  "reasoning": "high",
  "mode": "plan"
}
```

Catatan:

- `provider` opsional, default ke `aiPrimary` di settings.
- `model`, `reasoning`, `mode` opsional, disimpan ke `session.preferences`.
- Message user akan tetap disimpan ke session walaupun provider gagal.
- Request ini menjalankan CLI provider dengan `cwd` di folder project aktif (`project.projectPath`).
- Jika primary gagal dan fallback diset di settings, server akan mencoba fallback.
- Nilai `reasoning`: `low`, `medium`, `high`, `xhigh` (default `medium`).
- Jika prompt diawali command `/status`, backend skip provider call dan mengembalikan status Codex saat ini (provider response bertipe `system` di message session).

Success `200`:

```json
{
  "result": "siap",
  "progress": [
    "Planning edits",
    "Applying patch"
  ],
  "session": {
    "id": "farm.asrijaya.com::a1b2c3",
    "projectId": "cli-agent-node--www-wwwroot-cli-agent-node",
    "title": "Diskusi fitur tema",
    "createdAt": "2026-03-12T14:05:20.843Z",
    "updatedAt": "2026-03-12T14:06:20.000Z",
    "messages": []
  }
}
```

Catatan:

- `progress` bersifat opsional, berisi ringkasan log/progres dari CLI provider (jika tersedia).

CLI failure `502`, validation `400`, not found `404`, internal `500`.

## 10) Server Control

### `POST /api/restart`

Meminta server restart (butuh process manager seperti PM2/systemd untuk auto-restart).

Success `200`:

```json
{
  "ok": true,
  "message": "Server restart initiated. Ensure a process manager is running."
}
```
