# Source of Truth Protocol

Effective date: 2026-04-24

## 1) Prinsip Utama

1. GitHub repository `https://github.com/kopipes/skanban.git` adalah **source of truth untuk aplikasi** (code, config, migration script, dokumentasi).
2. SQLite database di VPS (`/home/ubuntu/board/skanban.db`) adalah **source of truth untuk data produksi**.
3. Data produksi tidak boleh ditimpa dari file database lokal developer.

## 2) Aturan Wajib

1. Semua perubahan aplikasi harus masuk ke GitHub dulu (commit + push), baru deploy ke VPS.
2. Semua perubahan data produksi dilakukan di VPS (via aplikasi atau SQL di VPS), bukan dari lokal.
3. Sebelum perubahan database manual/schema, wajib backup dulu.
4. Deploy harus non-disruptive:
   - gunakan service terpisah (`board.service`)
   - validasi `nginx -t` sebelum reload
   - jangan sentuh config domain lain.

## 3) Proses Perubahan

## A. Perubahan aplikasi (tanpa perubahan schema DB)

1. Ubah code lokal.
2. Test lokal.
3. Commit dan push ke GitHub (branch kerja atau `master`, sesuai kebijakan tim).
4. Deploy di VPS **dari GitHub** (jangan upload manual file code):
   - `cd /home/ubuntu/board && bash scripts/deploy_from_git.sh`
5. Script deploy akan:
   - backup `skanban.db` ke folder `backups/`
   - `git fetch` + `git reset --hard origin/master`
   - restart `board.service`
6. Verifikasi:
   - `sudo systemctl status board.service`
   - `curl -sS https://board.devop.my.id/api/health`
   - buka aplikasi di browser.

## B. Perubahan data operasional (isi project/task)

1. Lakukan perubahan via UI aplikasi produksi.
2. Data tersimpan langsung ke `/home/ubuntu/board/skanban.db`.
3. Tidak perlu commit database ke GitHub.

## C. Perubahan schema database (high risk)

1. Buat script migration di GitHub (contoh: `migrations/20260424_add_xxx.sql`).
2. Review script.
3. Backup database produksi:
   - `cp /home/ubuntu/board/skanban.db /home/ubuntu/board/backups/skanban_YYYYMMDD_HHMMSS.db`
4. Jalankan migration di VPS.
5. Verifikasi aplikasi dan query inti.
6. Jika gagal, rollback dari backup database terbaru.

## 4) Rollback Protocol

## A. Rollback aplikasi

1. Checkout commit stabil sebelumnya di VPS.
2. Restart `board.service`.
3. Verifikasi endpoint dan UI.

## B. Rollback database

1. Stop service:
   - `sudo systemctl stop board.service`
2. Restore backup:
   - `cp /home/ubuntu/board/backups/<backup_file>.db /home/ubuntu/board/skanban.db`
3. Start service:
   - `sudo systemctl start board.service`
4. Verifikasi API state dan UI.

## 5) Larangan

1. Jangan edit langsung file DB lokal lalu deploy untuk overwrite produksi.
2. Jangan jalankan perubahan Nginx tanpa `nginx -t`.
3. Jangan ubah site config domain lain saat deploy board.
4. Jangan hapus backup terakhir sebelum release dianggap stabil.

## 6) Checklist Rilis

1. Code sudah pushed ke GitHub.
2. Jika ada migration: script ada di GitHub.
3. Backup DB produksi sudah dibuat (jika ada perubahan DB manual/schema).
4. Deploy sukses, service sehat.
5. Domain `https://board.devop.my.id` sehat.
6. Catat release note singkat (commit hash + waktu deploy + operator).
