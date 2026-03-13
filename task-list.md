# Task List

Dokumentasi ini dipakai banyak agent untuk mencatat status task beserta keterangannya.

## Legend Status
- `todo` = belum dikerjakan
- `in_progress` = sedang dikerjakan
- `blocked` = terhambat, butuh bantuan/keputusan
- `review` = butuh review
- `done` = selesai

## Aturan Pengisian Singkat
- Satu baris = satu task.
- Update `updated_at` setiap perubahan.
- Jika status `blocked`, tulis penyebab di `notes`.
- Gunakan tanggal format ISO: `YYYY-MM-DD`.

## Task Table
| id | task | owner | status | priority | created_at | updated_at | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-001 | Inisialisasi daftar task | - | done | medium | 2026-03-12 | 2026-03-12 | File dibuat oleh agent |
| T-002 | Tambah AGENTS.md untuk aturan agent (task-list wajib) | codex | done | low | 2026-03-12 | 2026-03-12 | Rename dari AGENT.md agar otomatis dibaca |
| T-003 | Sinkronkan nama project agar selalu sama dengan nama folder | codex | done | medium | 2026-03-13 | 2026-03-13 | Normalisasi name berdasarkan path saat baca & simpan |
| T-004 | Tambah tombol hapus session + API delete | codex | done | medium | 2026-03-13 | 2026-03-13 | UI list session + endpoint DELETE |
| T-005 | Default judul session pakai waktu lokal browser | codex | done | low | 2026-03-13 | 2026-03-13 | Hindari timestamp UTC di title |
| T-006 | Auto-judul session dari prompt pertama | codex | done | medium | 2026-03-13 | 2026-03-13 | Title kosong diisi ringkas dari prompt |
| T-007 | Tambah indikator status dot (hijau/kuning/merah) | codex | done | low | 2026-03-13 | 2026-03-13 | Dot mengikuti status normal/busy/error |
| T-008 | Sembunyikan detail process-text (mode ringkas) | codex | done | low | 2026-03-13 | 2026-03-13 | Hanya tampilkan label status |
| T-009 | Tampilkan detail process-text (mode lengkap) | codex | done | low | 2026-03-13 | 2026-03-13 | Default show all kembali aktif |
| T-010 | Enter kirim, Shift+Enter newline di chat | codex | done | low | 2026-03-13 | 2026-03-13 | Handler keydown di prompt input |
| T-011 | Tambah file log untuk troubleshooting | codex | done | medium | 2026-03-13 | 2026-03-13 | app.log + logging di API & chat |
| T-012 | Indicator running jobs di header | codex | done | medium | 2026-03-13 | 2026-03-13 | API jobs + polling UI |
| T-013 | Jangan auto-open session saat refresh | codex | done | low | 2026-03-13 | 2026-03-13 | Abaikan stored session di init |
| T-014 | Ubah status session jadi dot warna (running/editing/error) | codex | done | medium | 2026-03-13 | 2026-03-13 | Hilangkan teks status, sembunyikan saat idle |
| T-015 | Kembalikan badge Running Jobs di header | codex | done | low | 2026-03-13 | 2026-03-13 | Teks + count tampil lagi |
| T-016 | Izinkan pindah session saat proses berjalan | codex | done | medium | 2026-03-13 | 2026-03-13 | Response tetap masuk ke session asal |
| T-017 | Sembunyikan status per-session di list | codex | done | low | 2026-03-13 | 2026-03-13 | Hanya tampilkan running jobs global |
| T-018 | Auto-create session saat kirim prompt | codex | done | medium | 2026-03-13 | 2026-03-13 | Jika belum ada session aktif |
| T-019 | Tambah popover detail running jobs | codex | done | medium | 2026-03-13 | 2026-03-13 | Klik badge untuk lihat list job |
| T-020 | Rapatkan spacing panel thinking | codex | done | low | 2026-03-13 | 2026-03-13 | Kurangi gap dan line-height |
| T-021 | Thinking panel: default "Memproses" + toggle panah | codex | done | low | 2026-03-13 | 2026-03-13 | Default ringkas, klik panah untuk detail |
| T-022 | Thinking hanya tampil untuk sesi aktif | codex | done | low | 2026-03-13 | 2026-03-13 | Hilangkan memproses di sesi lain |
| T-010 | Ubah tampilan tombol send menjadi simbol > | codex | done | low | 2026-03-13 | 2026-03-13 | Sinkron HTML awal dan state normal di frontend |
| T-011 | Clear prompt input segera setelah klik kirim | codex | done | low | 2026-03-13 | 2026-03-13 | Pindah clear textarea ke fase submit optimistis |
| T-012 | Pertahankan reset input chat meski request gagal | codex | done | low | 2026-03-13 | 2026-03-13 | Hapus restore `promptInput.value` di blok catch `sendPrompt` |
| T-013 | Tambah modul message queue + pisah tombol stop dari send | codex | done | medium | 2026-03-13 | 2026-03-13 | Queue prompt diproses berurutan, send tetap `>`, stop jadi tombol terpisah |
| T-014 | Posisi tombol Kirim + Stop rata kanan di mobile | codex | done | low | 2026-03-13 | 2026-03-13 | Ubah `.composer-actions` menjadi full-width flex pada breakpoint <=980px |
| T-015 | Perbaiki panel thinking agar live update terlihat jelas | codex | done | medium | 2026-03-13 | 2026-03-13 | Refresh isi `.thinking-live` tiap tick + aktifkan markup thinking shell |
| T-016 | Paksa panel thinking sempat tampil saat request sangat cepat | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah `waitForNextPaint()` + durasi minimum 900ms sebelum stop animasi |
| T-017 | Tambah indikator running per session di list sessions | codex | done | medium | 2026-03-13 | 2026-03-13 | Tampilkan `Running - sedang apa` saat proses aktif, kembali `Normal` saat selesai |
| T-018 | Tampilkan info progres dari output CLI ke panel proses | codex | done | medium | 2026-03-13 | 2026-03-13 | Tangkap `stderr` codex CLI sebagai `progress` API dan render event `CLI:` di frontend |
| T-019 | Fallback indikator running jobs saat polling backend telat | codex | done | low | 2026-03-13 | 2026-03-13 | Badge header ikut menghitung job lokal aktif agar tidak selalu terlihat off |
| T-020 | Tambah tombol stop all jobs + endpoint stop | codex | done | medium | 2026-03-13 | 2026-03-13 | Tombol settings untuk stop semua job + abort CLI best-effort |
| T-021 | Ringkas panel proses tetap tampil fase + timer | codex | done | low | 2026-03-13 | 2026-03-13 | Mode ringkas menampilkan fase, progress bar, dan meta |
| T-022 | Rapikan spacing panel proses | codex | done | low | 2026-03-13 | 2026-03-13 | Atur gap, margin compact, dan line-height agar lebih rapi |
| T-023 | Optimasi render chat untuk kurangi jank | codex | done | medium | 2026-03-13 | 2026-03-13 | Debounce render, autoscroll kondisional, dan append incremental |
| T-024 | Pindahkan panel proses ke composer 1 row | codex | done | medium | 2026-03-13 | 2026-03-13 | Proses tampil di bawah status, 1 row dengan dropdown detail |
| T-025 | Batasi panel proses hanya untuk session aktif | codex | done | medium | 2026-03-13 | 2026-03-13 | Proses terkait project/session disimpan dan hanya ditampilkan di session aktif |
| T-026 | Ubah antrean prompt jadi per session | codex | done | medium | 2026-03-13 | 2026-03-13 | Queue dipisah per project/session dan hanya diproses untuk session aktif |
| T-027 | Auto-drain queue saat session aktif | codex | done | medium | 2026-03-13 | 2026-03-13 | Queue lanjut otomatis ketika session aktif dipilih & selesai job |
| T-028 | Status session list sinkron dengan jobs | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah runtime dot + label status pada list session |
| T-029 | Rapikan posisi dot status di list session | codex | done | low | 2026-03-13 | 2026-03-13 | Dot dipindah ke kiri judul lewat wrapper title |
| T-030 | Refactor session list jadi komponen | codex | done | low | 2026-03-13 | 2026-03-13 | Ekstrak render item session ke helper reusable |
| T-031 | Komponen pesan user & AI | codex | done | low | 2026-03-13 | 2026-03-13 | Ekstrak render pesan ke module message-components |
| T-032 | Percantik komponen pesan AI (markdown ringan) | codex | done | low | 2026-03-13 | 2026-03-13 | Tambah render markdown ringan + styling untuk pesan AI |
| T-033 | Highlight path + link biru klasik di pesan AI | codex | done | low | 2026-03-13 | 2026-03-13 | Deteksi path umum dan styling link biru klasik di markdown AI |
| T-034 | Persist session aktif saat reload | codex | done | low | 2026-03-13 | 2026-03-13 | Gunakan stored activeSessionId per project saat load |
| T-035 | Ganti ikon kontrol composer jadi mono | codex | done | low | 2026-03-13 | 2026-03-13 | Emoji di kontrol model/reasoning/mode diganti ikon mono SVG |
| T-036 | Status login CLI Codex di settings | codex | done | low | 2026-03-13 | 2026-03-13 | Endpoint auth-status pakai `printf \"/status\" | codex` + deteksi error subcommand |
| T-037 | Perbaiki hover button danger di tema terang | codex | done | low | 2026-03-13 | 2026-03-13 | Hover umum tidak override background tombol danger/stop |
| T-038 | Perbaiki tema gelap Aether + audit kontras | codex | done | low | 2026-03-13 | 2026-03-13 | Aether jadi dark, update preview, ganti hover putih |
| T-041 | Perbaiki cek login Codex saat `sudo` atau PTY tidak tersedia | codex | done | medium | 2026-03-13 | 2026-03-13 | Coba `/status` tanpa sudo lalu fallback langsung ke `~/.codex/auth.json` |
| T-021 | Ringkaskan tampilan panel proses agar tidak terlalu besar | codex | done | low | 2026-03-13 | 2026-03-13 | Ubah panel jadi compact: status, timer, dan maksimal 2 aktivitas terbaru |
| T-022 | Remake template system prompt jadi 1-3 baris tanpa wrapper | codex | done | medium | 2026-03-13 | 2026-03-13 | Hapus format `System instructions/User`, kirim prompt global secara langsung dan ringkas |
| T-023 | Sederhanakan tampilan utama agar lebih bersih dan tidak mengganggu | codex | done | medium | 2026-03-13 | 2026-03-13 | Rapikan copy, ubah tema jadi lebih ringan, kecilkan elemen chat dan composer |
| T-023 | Sederhanakan UI chat agar lebih tenang dan tidak mengganggu | codex | done | medium | 2026-03-13 | 2026-03-13 | Default tema jadi slate, kurangi animasi/dekorasi, kecilkan tipografi, ringkaskan copy halaman utama |
| T-024 | Hapus modul proses thinking | codex | done | medium | 2026-03-13 | 2026-03-13 | Lepas panel thinking dari chat, hapus `public/js/process-ui.js`, status proses tetap internal |
| T-025 | Tambah activity status `typing...` saat assistant akan membalas | codex | done | low | 2026-03-13 | 2026-03-13 | Tambah indikator activity di composer yang tampil otomatis selama assistant masih memproses balasan |
| T-026 | Batalkan penghapusan modul proses thinking | codex | done | high | 2026-03-13 | 2026-03-13 | Restore `public/js/process-ui.js` agar UI tidak error |
| T-027 | Hapus status typing dan ubah kontrol model/reasoning/mode jadi ikon | codex | done | low | 2026-03-13 | 2026-03-13 | Singkirkan label \"typing\" + ikon-only drop-down untuk kontrol composer |
| T-039 | Perbarui audit login Codex CLI agar kompatibel dengan status `/status` | codex | done | medium | 2026-03-13 | 2026-03-13 | Fallback auth.json jika TTY gagal |
| T-040 | Tambah reverse proxy nginx untuk akses via Tailscale IP | codex | done | medium | 2026-03-13 | 2026-03-13 | Dibatalkan: vhost Tailscale dihapus sesuai permintaan |
| T-041 | Cegah job ganda untuk prompt identik | codex | done | medium | 2026-03-13 | 2026-03-13 | Dedupe backend + UI queue/inflight |
| T-042 | Antrian per sesi paralel + status proses pulih dari jobs | codex | done | medium | 2026-03-13 | 2026-03-13 | Per-sesi serial, antar sesi paralel, sync proses dari `/api/jobs` |
| T-042 | Perbaiki fallback path auth Codex saat `CODEX_HOME` menunjuk ke `.codex` | codex | done | medium | 2026-03-13 | 2026-03-13 | Cek multi-kandidat path auth.json agar status login tidak false logged_out |
| T-043 | Perbaiki session list berkedip saat polling jobs | codex | done | medium | 2026-03-13 | 2026-03-13 | Update status runtime session langsung di DOM tanpa rerender seluruh list tiap polling |
| T-044 | Fallback status login Codex saat cek `/status` timeout | codex | done | medium | 2026-03-13 | 2026-03-13 | Timeout cek CLI tidak lagi tampil error; fallback baca `auth.json` + timeout dinaikkan ke 15 detik |
| T-045 | Tambah system chat command `/status` di alur kirim prompt | codex | done | medium | 2026-03-13 | 2026-03-13 | Jika prompt mengandung `/status`, backend skip provider call dan kirim balasan assistant `system` berisi hasil status Codex + label `System` di UI chat |
| T-046 | Ubah deteksi command `/status` jadi gaya Telegram (harus diawali slash command) | codex | done | medium | 2026-03-13 | 2026-03-13 | Deteksi `/status` diperketat: hanya aktif jika prompt diawali `/status` (opsional `/status@bot`) dan kini konsisten di session chat + endpoint legacy `/ask` |
| T-047 | Audit bottleneck performa dan glitch UI website | codex | review | high | 2026-03-13 | 2026-03-13 | Audit selesai: temuan utama di rerender chat penuh, polling project/session yang mahal, parsing markdown DOM-heavy, dan animasi CSS terus-menerus |
| T-048 | Tambah cache render pesan chat untuk kurangi rerender berat | codex | done | high | 2026-03-13 | 2026-03-13 | Cache parts, HTML markdown, dan template DOM pesan agar rebuild chat besar tidak parse/render ulang dari nol |
| T-049 | Virtualisasi chat list untuk session panjang | codex | done | high | 2026-03-13 | 2026-03-13 | Initial render dibatasi 80 pesan terakhir, scroll atas load batch 50 pesan lebih lama, dan DOM+scroll cache per-session disimpan di `app.js` agar switch session lebih ringan |

## Backlog (Opsional)
- Tambah kolom `link` jika perlu tautan PR/issue.
- Jika task besar, pecah menjadi subtask dengan id berbeda.
