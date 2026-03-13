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
| T-043 | Tambah file dummy untuk uji undo | codex | done | low | 2026-03-13 | 2026-03-13 | Buat 6 file di `tmp-test/` |
| T-044 | Isi ulang file tmp-test dengan konten acak | codex | done | low | 2026-03-13 | 2026-03-13 | Overwrite 6 file dengan `random: <token>` |
| T-042 | Perbaiki fallback path auth Codex saat `CODEX_HOME` menunjuk ke `.codex` | codex | done | medium | 2026-03-13 | 2026-03-13 | Cek multi-kandidat path auth.json agar status login tidak false logged_out |
| T-043 | Perbaiki session list berkedip saat polling jobs | codex | done | medium | 2026-03-13 | 2026-03-13 | Update status runtime session langsung di DOM tanpa rerender seluruh list tiap polling |
| T-044 | Fallback status login Codex saat cek `/status` timeout | codex | done | medium | 2026-03-13 | 2026-03-13 | Timeout cek CLI tidak lagi tampil error; fallback baca `auth.json` + timeout dinaikkan ke 15 detik |
| T-045 | Tambah system chat command `/status` di alur kirim prompt | codex | done | medium | 2026-03-13 | 2026-03-13 | Jika prompt mengandung `/status`, backend skip provider call dan kirim balasan assistant `system` berisi hasil status Codex + label `System` di UI chat |
| T-046 | Ubah deteksi command `/status` jadi gaya Telegram (harus diawali slash command) | codex | done | medium | 2026-03-13 | 2026-03-13 | Deteksi `/status` diperketat: hanya aktif jika prompt diawali `/status` (opsional `/status@bot`) dan kini konsisten di session chat + endpoint legacy `/ask` |
| T-047 | Audit bottleneck performa dan glitch UI website | codex | review | high | 2026-03-13 | 2026-03-13 | Audit selesai: temuan utama di rerender chat penuh, polling project/session yang mahal, parsing markdown DOM-heavy, dan animasi CSS terus-menerus |
| T-048 | Tambah cache render pesan chat untuk kurangi rerender berat | codex | done | high | 2026-03-13 | 2026-03-13 | Cache parts, HTML markdown, dan template DOM pesan agar rebuild chat besar tidak parse/render ulang dari nol |
| T-049 | Virtualisasi chat list untuk session panjang | codex | done | high | 2026-03-13 | 2026-03-13 | Initial render dibatasi 80 pesan terakhir, scroll atas load batch 50 pesan lebih lama, dan DOM+scroll cache per-session disimpan di `app.js` agar switch session lebih ringan |
| T-050 | Cegah shortcut undo/redo memicu popup di input chat | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah guard modifier key di submit Enter dan stop propagation untuk `historyUndo/historyRedo` pada prompt |
| T-051 | Buat 10 file markdown di /temp-test | codex | done | low | 2026-03-13 | 2026-03-13 | Buat 10 file `.md` kosong untuk kebutuhan user |
| T-052 | Buat skill backup-undo untuk snapshot/restore file | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah skill `backup-undo` + script snapshot/undo |
| T-053 | Tambah alias `bu` untuk backup-undo di bashrc | codex | done | low | 2026-03-13 | 2026-03-13 | Alias menunjuk ke `backup_undo.py` |
| T-054 | Buat 10 file xfile di /mp-test dan snapshot backup | codex | done | low | 2026-03-13 | 2026-03-13 | Buat 10 file `xfile*.md` + backup snapshot folder |
| T-055 | Buat 15 file xfile di /tmp-test dan snapshot backup | codex | done | low | 2026-03-13 | 2026-03-13 | Buat 15 file `xfile*.md` + backup snapshot folder |
| T-056 | Hapus skill backup-undo dan alias bu | codex | done | low | 2026-03-13 | 2026-03-13 | Delete folder skill + hapus alias di bashrc |
| T-057 | Bersihkan snapshot backup-undo | codex | done | low | 2026-03-13 | 2026-03-13 | Hapus folder snapshot di /root/.codex-backups |
| T-052 | Tambah tombol undo untuk membatalkan giliran chat terakhir | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah endpoint undo session, tombol composer, dan hapus 1 turn terakhir sampai pesan user terbaru |
| T-058 | Kurangi fetch session redundant saat reload daftar session | codex | done | medium | 2026-03-13 | 2026-03-13 | Reuse `activeSession` jika `updatedAt` dan `messageCount` masih sama agar `getSession` tidak selalu dipanggil lagi |
| T-059 | Commit perubahan UI/performa dengan backup git aman | codex | done | low | 2026-03-13 | 2026-03-13 | Buat backup branch sebelum commit lalu push perubahan ke remote |
| T-060 | Rapikan ikon tombol model/reasoning/plan agar tidak terpotong | codex | done | low | 2026-03-13 | 2026-03-13 | Lanjutan perbaikan: ikon dipusatkan eksplisit dan mask diperkecil agar stroke SVG tidak kena crop, area chip tetap 48x48 |
| T-061 | Lanjutkan antrean prompt setelah refresh saat job session selesai | codex | done | medium | 2026-03-13 | 2026-03-13 | Saat polling `/api/jobs` melepas status running untuk session, frontend kini auto `drainPromptQueue()` agar prompt yang sempat queued setelah refresh benar-benar terkirim |
| T-062 | Izinkan pindah project saat job aktif + auto-refresh session background | codex | done | medium | 2026-03-13 | 2026-03-13 | Hapus blokir pindah project, refresh session selesai via polling jobs |
| T-062 | Tampilkan identitas akun dari fallback auth Codex | codex | done | low | 2026-03-13 | 2026-03-13 | Decode payload JWT di `auth.json` agar field `account` terisi email saat cek `/status` gagal pakai PTY |
| T-063 | Perbaiki parser auth-status agar detail akun/model tidak hilang | codex | done | medium | 2026-03-13 | 2026-03-13 | Jangan return terlalu cepat saat output `/status` memuat `Logged in` sekaligus field `Account/Model/Session/limit` |
| T-064 | Rapikan label status login agar tidak misleading `sudo/root` | codex | done | low | 2026-03-13 | 2026-03-13 | Hapus hint `Checked as root` dan ganti instruksi login jadi `codex login`, plus tampilkan source auth |
| T-065 | Tegaskan auth hanya via CLI, bukan dari token | codex | done | low | 2026-03-13 | 2026-03-13 | Rapikan copy settings, README, API, dan operations agar jelas token auth hanya fallback cek status |
| T-066 | Rapikan pesan status login Codex di halaman settings | codex | done | low | 2026-03-13 | 2026-03-13 | Ubah label `Logged out` jadi `Belum login` dan sembunyikan detail generik `not authenticated` agar hint lebih jelas |
| T-067 | Popup running jobs klik membuka project/session tujuan | codex | done | medium | 2026-03-13 | 2026-03-13 | Item popover diubah jadi tombol interaktif; klik langsung pindah ke project dan session job target |
| T-068 | Perbaiki API status login Codex agar pakai `codex login status` | codex | done | high | 2026-03-13 | 2026-03-13 | Ganti cek TUI `/status` lama ke subcommand CLI resmi, parser source dirapikan, README ikut disesuaikan |
| T-069 | Tutup nav menu kiri saat klik area luar menu | codex | done | low | 2026-03-13 | 2026-03-13 | Tambah handler `pointerdown` global di mobile agar sidebar menutup saat klik/tap di luar panel |
| T-070 | Rapikan tema gelap popup running jobs | codex | done | low | 2026-03-13 | 2026-03-13 | Perkuat kontras badge dan popover running jobs khusus tema gelap agar lebih selaras |
| T-071 | Besarkan wrapper chip ikon composer agar ikon tidak terpotong | codex | done | low | 2026-03-13 | 2026-03-13 | Naikkan ukuran `.chip-icon-wrap.icon-only` dari 48px ke 52px supaya ikon chip pertama tidak kepotong |
| T-072 | Tampilkan nama project aktif di sebelah queue status header | codex | done | low | 2026-03-13 | 2026-03-13 | Pindahkan badge `Queue` ke samping `#activeProjectName` dan rapikan alignment header responsif |
| T-073 | Sinkronkan tinggi container composer chips dengan wrapper ikon | codex | done | low | 2026-03-13 | 2026-03-13 | Naikkan `max-height` `.composer-chips` ke 56px, kunci flex-basis wrapper 52px, lalu kecilkan glyph ikon ke 14px agar tidak crop lagi |
| T-087 | Perbaiki perintah login Claude jadi `claude login` | codex | done | low | 2026-03-13 | 2026-03-13 | Ganti referensi `claude auth login` di settings UI dan helper frontend |
| T-074 | Kecilkan lagi glyph ikon composer sekitar 15 persen | codex | done | low | 2026-03-13 | 2026-03-13 | Turunkan ukuran `.chip-icon` dari 14px ke 12px tanpa ubah wrapper 52px agar layout tetap stabil |
| T-075 | Perbaiki warna judul item running jobs di tema gelap | codex | done | low | 2026-03-13 | 2026-03-13 | Set `.jobs-row` mewarisi `var(--text)` agar `.jobs-title` tidak ikut hitam saat theme gelap |
| T-076 | Perbaiki code box gelap dan fallback tombol copy | codex | done | low | 2026-03-13 | 2026-03-13 | Warna code card ikut variabel tema gelap dan tombol copy pakai fallback `execCommand` saat Clipboard API gagal |
| T-077 | Tambah popup daftar queue aktif + aksi inject ke input chat | codex | done | medium | 2026-03-13 | 2026-03-13 | Klik badge `Queue` buka popover item antrean session aktif; tiap item bisa `Inject` ke textarea atau `Hapus` dari antrean |
| T-078 | Jadikan progress bar pakai progres real CLI + fallback indeterminate | codex | done | medium | 2026-03-13 | 2026-03-13 | Tangkap persen real dari stderr CLI ke job polling; frontend pakai angka itu, dan jika belum ada angka maka bar tampil indeterminate |
| T-079 | Pertahankan session yang sedang dibuka saat browser refresh | codex | done | medium | 2026-03-13 | 2026-03-13 | Sinkronkan project/session aktif ke query URL dan prioritaskan itu saat init/load session |
| T-080 | Verifikasi ulang perubahan auth/progress/queue terbaru | codex | done | low | 2026-03-13 | 2026-03-13 | Cek syntax backend, load module, `git diff --check`, dan review diff area auth status, progress percent, queue popover, serta URL state |
| T-081 | Tambah email login Codex + tombol logout + flow device-auth di Settings | codex | done | high | 2026-03-13 | 2026-03-13 | Tambah endpoint logout/device-auth, tampilkan email akun, aksi refresh/logout/login ulang dengan link + kode verifikasi |
| T-082 | Perjelas warning provider gagal dengan indikasi limit dan link device-auth | codex | done | medium | 2026-03-13 | 2026-03-13 | Warning chat kini mendeteksi limit/auth Codex, menampilkan alasan yang lebih jelas, command `codex login --device-auth`, dan link login bila device-auth berhasil diambil |
| T-083 | Seimbangkan proporsi ikon chip reasoning/model/plan | codex | done | low | 2026-03-13 | 2026-03-13 | Besarkan sedikit glyph ikon tengah, kecilkan visual background chip, dan beri scale per ikon agar proporsinya lebih rapi |
| T-084 | Tambah status/login/logout Claude CLI di Settings | codex | done | medium | 2026-03-13 | 2026-03-13 | Backend auth kini mendukung provider `claude`, UI settings menampilkan status Claude + logout, dan hint chat pakai command login Claude yang benar |
| T-085 | Lengkapi email login Codex dari auth file saat output CLI minim | codex | done | medium | 2026-03-13 | 2026-03-13 | Jika `codex login status` hanya memberi status umum seperti `Logged in using ChatGPT`, backend kini merge `account/email` dari `auth.json` agar email akun tetap tampil di Settings |
| T-086 | Perjelas hint bahwa link device-auth akan muncul setelah klik | codex | done | low | 2026-03-13 | 2026-03-13 | Ubah copy settings dan status runtime agar user tahu link verifikasi dan kode akan muncul setelah mulai device auth |
| T-088 | Pindahkan persistence project/settings/session ke SQLite | codex | done | high | 2026-03-13 | 2026-03-13 | Tambah `data/app.sqlite`, migrasi otomatis dari file JSON lama, dan pertahankan mirror JSON untuk kompatibilitas |
| T-089 | Tambah memory SQLite terpisah untuk scope session dan project | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah tabel `memories`, service + API get/put memory, lalu injeksikan project/session memory ke prompt provider saat relevan |
| T-090 | Tambah tombol Login Claude + flow backend login interaktif | codex | done | medium | 2026-03-13 | 2026-03-13 | Tambah endpoint `/api/auth/login` untuk `claude auth login`, tampilkan tombol Login Claude + output link/status di Settings, dan rapikan command login Claude di hint UI/docs |

## Backlog (Opsional)
- Tambah kolom `link` jika perlu tautan PR/issue.
- Jika task besar, pecah menjadi subtask dengan id berbeda.
