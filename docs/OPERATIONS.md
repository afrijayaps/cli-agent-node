# Operations Guide

Panduan operasional untuk menjalankan server di environment Linux (termasuk akses dari device lain via Tailscale/LAN).

## 1) Menjalankan Aplikasi

```bash
cd /www/wwwroot/.cli-agent-node
npm install
npm start
```

## 2) Jalankan Sebagai Service (systemd)

Contoh service:

`/etc/systemd/system/cli-agent-node.service`

```ini
[Unit]
Description=AI CLI Agent Node Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/www/wwwroot/.cli-agent-node
ExecStart=/usr/bin/node /www/wwwroot/.cli-agent-node/server.js
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Perintah:

```bash
systemctl daemon-reload
systemctl enable --now cli-agent-node
systemctl status cli-agent-node
```

## 3) Port dan Firewall

Server listen di port `8000`.

Cek port:

```bash
ss -lntp | rg :8000
```

Jika pakai UFW dan akses via Tailscale:

```bash
ufw allow in on tailscale0 to any port 8000 proto tcp
ufw status
```

## 4) Login Provider CLI

Default provider aplikasi: `codex`.

Login codex di server:

```bash
codex login --device-auth
codex login status
```

Login Claude di server:

```bash
claude auth login
claude auth status --json
```

Tes non-interaktif (dipakai server):

```bash
codex exec "say ok"
```

Catatan:

- Server menggunakan mode non-interaktif untuk codex (`codex exec`), bukan mode TUI interaktif.
- Halaman Settings menyediakan tombol `Mulai Device Auth` untuk Codex dan `Login Claude` untuk memulai login dari web jika CLI mendukung flow tersebut.

## 5) Monitoring dan Log

Status service:

```bash
systemctl status cli-agent-node --no-pager -l
```

Log terakhir:

```bash
journalctl -u cli-agent-node -n 200 --no-pager
```

Follow log:

```bash
journalctl -u cli-agent-node -f
```

## 6) Master Project Root (Aturan Sumber Project)

Aplikasi membaca daftar project dari subfolder di `masterProjectRoot`.

Lihat setting aktif:

```bash
curl http://127.0.0.1:8000/api/settings
```

Set master root:

```bash
curl -X PUT http://127.0.0.1:8000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"masterProjectRoot":"/www/wwwroot"}'
```

Verifikasi hasil scan project:

```bash
curl http://127.0.0.1:8000/api/projects
```

Restart server (butuh process manager seperti PM2/systemd):

```bash
curl -X POST http://127.0.0.1:8000/api/restart
```

## 7) Troubleshooting

### A. Tidak bisa akses dari PC lain

Checklist:

1. Service aktif:
   - `systemctl is-active cli-agent-node`
2. Port listen:
   - `ss -lntp | rg :8000`
3. Firewall allow:
   - `ufw status`
4. Uji dari server:
   - `curl http://127.0.0.1:8000/health`
5. Uji dari remote:
   - `curl http://<ip-server>:8000/health`

### B. Error login / provider gagal

Jika response `502`:

- Pastikan binary provider ada di PATH (`which codex`).
- Pastikan sudah login via CLI (`codex login`).
- Jangan andalkan inject token manual ke aplikasi; flow yang didukung tetap sesi login CLI user server.
- Tes manual:
  - `codex exec "test"`
  - Pastikan command dijalankan dari folder project aktif jika butuh path relatif.

### C. Session tidak muncul

- Cek data tersimpan di:
  - `data/projects/.../sessions/*.json`
- Cek API:
  - `GET /api/projects`
  - `GET /api/projects/:projectId/sessions`
- Format `session.id`: `<folderProject>::<6-char>` (contoh `farm.asrijaya.com::a1b2c3`).

### D. Project list kosong

- Pastikan `masterProjectRoot` benar dan absolut:
  - `GET /api/settings`
- Pastikan folder root memang ada dan berisi subfolder project:
  - `ls -la <masterProjectRoot>`
- Trigger reload project list:
  - `GET /api/projects`

## 8) Backup Data Session

Backup folder data:

```bash
tar -czf cli-agent-node-data-backup.tar.gz /www/wwwroot/.cli-agent-node/data
```

Restore:

```bash
tar -xzf cli-agent-node-data-backup.tar.gz -C /
```
