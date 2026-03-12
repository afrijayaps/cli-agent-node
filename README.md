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
  - halaman settings: `/settings` (tema + session manager)
- Frontend saat ini: Vanilla JS modular (tanpa React), dengan animasi UI (message reveal, typing indicator, hover motion).
- Proses menjawab menampilkan lifecycle real request (send prompt, wait provider, persist response) dengan timer elapsed real-time.
- Jika proses gagal, indikator proses berubah merah dan kartu `Peringatan` tampil di chat.
- Mobile-first UX: panel kontrol project/session tampil sebagai popup settings (slide-in) dan fokus utama di area chat.
- Konten assistant tetap tampil penuh tanpa bubble besar; code block ditampilkan sebagai codebox compact dengan tombol copy.
- Placeholder input prompt menampilkan `session.id` aktif agar mudah tracking sesi.
- Theme modular (default `aether`, opsi `slate`, `ember`).
- Default provider: `codex`.
- Daftar project otomatis diambil dari subfolder di dalam `masterProjectRoot`.
- Penyimpanan session persisten di folder `data/projects/...`.
- Auth provider tetap lewat CLI login di server (bukan API key aplikasi).
- CLI provider dieksekusi dengan `cwd` sesuai folder project yang dipilih.

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

`data/projects/cli-agent-node/www-wwwroot-cli-agent-node/sessions/farm.asrijaya.com::a1b2c3.json`

Catatan:

- Struktur lama satu level project tetap didukung untuk backward compatibility.
- Format `session.id`: `<folderProject>::<6-char>` (contoh `farm.asrijaya.com::a1b2c3`).

## Rule Project Source (Master Path)

- Sumber daftar project bukan input manual.
- Aplikasi membaca folder master (`masterProjectRoot`), lalu semua subfolder level 1 dijadikan project yang bisa dipilih.
- Default `masterProjectRoot`: `/www/wwwroot`.
- `masterProjectRoot` bisa diubah dari halaman settings (`/settings`) atau API `PUT /api/settings`.
- Di halaman chat (`/`), `Project Source Root` bisa diketik manual, disimpan dengan tombol `OK` (otomatis lock/disable), lalu bisa dibuka lagi pakai `Buka/Edit`.

## Motion Engine (UI Chat)

Status proses jawaban dikelola modular di:

- `public/js/app.js`:
  - state proses: `state.process` (label, elapsed time, error mode)
  - `startThinkingAnimation()` / `setProcessLabel()` / `stopThinkingAnimation()`
  - tombol `Send` otomatis berubah `Stop` saat request aktif (abort request)
  - parser konten assistant: text tetap tampil, code fence jadi codebox dengan copy button
- `public/css/base.css`:
  - class proses compact: `.thinking-live`, `.thinking-inline`, `.thinking-live.error`
  - class assistant compact: `.message.assistant-flat`, `.code-card.compact`
  - warning level: `.message.warning.error` dan `.message.warning.info`

Catatan tuning cepat:

- ingin update timer proses lebih cepat/lambat: ubah interval di `startThinkingAnimation()`.
- ingin ubah gaya warning error/info: edit class `.message.warning.error` / `.message.warning.info`.
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
