import os
from pathlib import Path

# --- KONFIGURASI ---
TARGET_DIRECTORY = r"C:\Users\PC\Documents\Dev\E-LIMBAD\limbah-be"
OUTPUT_FILE = r"C:\Users\PC\Documents\Dev\E-LIMBAD\limbah-be\limbah-be-context.txt"

# 1. Folder yang HARAM hukumnya (Blacklist)
# Disesuaikan dengan ekosistem Node.js Backend. Folder 'uploads' di-skip karena isinya file user/gambar.
FORBIDDEN_DIRS = {
    "node_modules", ".git", "dist", "build", "coverage",
    ".vscode", ".idea", "uploads", "temp"
}

# 2. Folder yang BOLEH diambil (Whitelist)
# Biasanya source code backend ada di 'src'. Folder 'prisma' juga wajib dibawa untuk schema DB.
ALLOWED_DIRS = {"src", "prisma", "controllers", "routes", "services", "models", "middlewares", "utils", "config"}

# 3. Ekstensi yang diinginkan untuk Node.js (tambah .prisma untuk schema)
INCLUDE_EXTENSIONS = {".ts", ".js", ".json", ".prisma"}

# 4. File penting di root folder yang WAJIB dibawa agar AI paham konteks project
# Catatan: package-lock.json Senga TIDAK dimasukkan karena terlalu panjang & bikin AI pusing
ESSENTIAL_ROOT_FILES = {"package.json", "tsconfig.json", ".env", ".gitignore"}

def is_binary(file_path: Path) -> bool:
    try:
        with open(file_path, 'rb') as f:
            return b'\x00' in f.read(512)
    except Exception:
        return True

def main():
    target_path = Path(TARGET_DIRECTORY)
    if not target_path.is_dir():
        print(f"Error: Folder '{TARGET_DIRECTORY}' tidak ditemukan.")
        return

    files_to_process = []
    print("Memproses file (Node.js Backend Mode)...")
    
    # MENGGUNAKAN os.walk() SEBAGAI PENGGANTI rglob()
    # Ini jauh lebih cepat karena kita bisa memblokir Python masuk ke node_modules dkk
    for root, dirs, files in os.walk(target_path):
        # Cegah Python masuk ke folder terlarang (SANGAT hemat waktu)
        dirs[:] = [d for d in dirs if d not in FORBIDDEN_DIRS]

        root_path = Path(root)

        for file_name in files:
            file_path = root_path / file_name
            relative_path = file_path.relative_to(target_path)
            
            # Cek apakah ini file konfigurasi di root folder (package.json, .env, dll)
            is_essential_root = (len(relative_path.parts) == 1 and file_name in ESSENTIAL_ROOT_FILES)
            
            # Cek apakah file berada di dalam folder yang diizinkan (src, prisma, dll)
            is_in_allowed_dir = any(part in ALLOWED_DIRS for part in relative_path.parts)
            
            # Jika bukan file konfigurasi penting DAN tidak ada di whitelist -> abaikan
            if not is_essential_root and not is_in_allowed_dir:
                continue
            
            # Cek ekstensi file (hanya untuk file di dalam ALLOWED_DIRS)
            if not is_essential_root and file_path.suffix not in INCLUDE_EXTENSIONS:
               continue

            # Cek apakah file berupa binary
            if not is_binary(file_path):
               files_to_process.append(file_path)

    # Tulis hasil
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("=== STRUKTUR & ISI KODE (NODE.JS BACKEND MODE) ===\n\n")
        for file_path in sorted(files_to_process):
            relative_path = file_path.relative_to(target_path)
            try:
                content = file_path.read_text("utf-8", errors="ignore")
                f.write(f"\n--- FILE: {relative_path} ---\n")
                f.write(content)
                f.write("\n")
                print(f"-> Menyalin: {relative_path}")
            except Exception as e:
                print(f"-> Gagal baca {relative_path}: {e}")

    print(f"\nSelesai! File Backend Node.js tersimpan di: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()