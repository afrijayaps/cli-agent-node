# AI CLI Agent Node

Server AI berbasis Node.js + Express yang memanggil provider lewat CLI (tanpa API key di aplikasi), dengan UI web modular, multi-theme, dan session chat persisten per project.

## Fitur Utama

- `GET /health` dan `POST /ask` (legacy compatibility).
- API modular di `/api/*` untuk:
  - settings tema,
  - setting `masterProjectRoot`,
  - daftar project,
  - daftar session per project,
  - kirim prompt dalam session.
- Frontend web:
  - halaman chat: `/`
  - halaman settings: `/settings`
- Frontend saat ini: Vanilla JS modular (tanpa React), dengan animasi UI (message reveal, typing indicator, hover motion).
- Proses menjawab dibuat lebih hidup: progress/fase thinking dinamis, telemetry (token/s, latency, confidence), pipeline status real-time, scan/orbit effect, dan flash reveal saat jawaban assistant tiba.
- Mobile-first UX: panel kontrol project/session tampil sebagai popup settings (slide-in) dan fokus utama di area chat.
- Jika provider gagal, UI menampilkan kartu `Peringatan` langsung di area chat (detail error + saran troubleshooting).
- Theme modular (default `aether`, opsi `slate`, `ember`).
- Default provider: `codex`.
- Daftar project otomatis diambil dari subfolder di dalam `masterProjectRoot`.
- Penyimpanan session persisten di folder `data/projects/...`.
- Auth provider tetap lewat CLI login di server (bukan API key aplikasi).

## Arsitektur Ringkas

- `server.js`: bootstrap Express, static frontend, routing utama.
- `routes/api.js`: endpoint API modular.
- `services/`:
  - `chat-service.js`: validasi + eksekusi chat.
  - `project-service.js`: CRUD project/session + persistence.
  - `settings-service.js`: load/save settings app.
  - `storage.js`: helper filesystem.
- `providers/`:
  - `codex.js`, `claude.js`, `antigravity.js`, `ollama.js`
  - `index.js` registry provider + default provider.
- `public/`: UI chat + settings + assets JS/CSS.
- `config/themes.js`: daftar tema terpusat.

## Struktur Data Session

Project dan session disimpan berbasis folder:

`data/projects/<slug-nama-project>/<slug-project-path>/`

Isi:

- `project.json`
- `sessions/<session-id>.json`

Contoh:

`data/projects/cli-agent-node/www-wwwroot-cli-agent-node/sessions/s-xxxx.json`

Catatan:

- Struktur lama satu level project tetap didukung untuk backward compatibility.

## Rule Project Source (Master Path)

- Sumber daftar project bukan input manual.
- Aplikasi membaca folder master (`masterProjectRoot`), lalu semua subfolder level 1 dijadikan project yang bisa dipilih.
- Default `masterProjectRoot`: `/www/wwwroot`.
- `masterProjectRoot` bisa diubah dari halaman settings (`/settings`) atau API `PUT /api/settings`.
- Di halaman chat (`/`), `Project Source Root` bisa diketik manual, disimpan dengan tombol `OK` (otomatis lock/disable), lalu bisa dibuka lagi pakai `Buka/Edit`.

## Motion Engine (UI Chat)

Animasi proses jawaban dikelola modular di:

- `public/js/app.js`:
  - `THINKING_PHASES`, `THINKING_PIPELINE`, `THINKING_NOTES`
  - `startThinkingAnimation()` / `stopThinkingAnimation()`
  - telemetry update via `updateThinkingMetrics()`
  - efek kedatangan jawaban via `scheduleAssistantFlash()`
- `public/css/base.css`:
  - class utama: `.thinking-shell`, `.thinking-telemetry`, `.thinking-pipeline`, `.assistant-arrived`
  - keyframes utama: `thinkingShimmer`, `gridDrift`, `orbitSpin`, `arrivalSweep`, `dataBars`

Catatan tuning cepat:

- ingin animasi lebih cepat/lambat: ubah interval di `startThinkingAnimation()`.
- ingin glow lebih kuat/lembut: ubah opacity di class `.thinking-live`, `.assistant-arrived`, `.thinking-grid`.
- tetap accessible: mode `prefers-reduced-motion: reduce` sudah didukung.

## Prasyarat

- Node.js dan npm terpasang.
- CLI provider terpasang sesuai kebutuhan.
- Untuk default provider, pastikan `codex` CLI siap.

## Instalasi dan Menjalankan

```bash
cd /www/wwwroot/.cli-agent-node
npm install
npm start
```

Server listen di port `8000`.

## Login Provider (CLI, Bukan API Key)

Default provider adalah `codex`, jadi lakukan login di server:

```bash
codex login
```

Verifikasi:

```bash
codex --help
codex exec "say ok"
```

## Uji Cepat

### Health

```bash
curl http://127.0.0.1:8000/health
```

### Ask (legacy endpoint)

`provider` opsional; jika tidak dikirim akan default `codex`.

```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"prompt":"jawab singkat: ok"}'
```

### UI

- Chat: `http://<server-ip>:8000/`
- Settings: `http://<server-ip>:8000/settings`

## Dokumentasi Detail

- API lengkap: [docs/API.md](./docs/API.md)
- Operasional service + troubleshooting: [docs/OPERATIONS.md](./docs/OPERATIONS.md)

## Kebijakan Dokumentasi

Setiap perubahan fitur/endpoint/operasional wajib diikuti update dokumentasi:

- perubahan kontrak API -> update `docs/API.md`
- perubahan flow deploy/ops -> update `docs/OPERATIONS.md`
- perubahan arsitektur/fitur utama -> update `README.md`
