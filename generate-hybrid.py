#!/usr/bin/env python3
# agregator-be.py
import os
import re
import argparse
from pathlib import Path
from typing import Set

# =========================================================================
# CONFIGURATION CLASS (Information Expert)
# Menyimpan seluruh konfigurasi penapisan backend secara terpusat
# =========================================================================
class BackendAggregatorConfig:
    DEFAULT_TARGET = r"C:\Users\PC\Documents\Dev\E-LIMBAD\limbah-be"
    DEFAULT_OUTPUT = "limbah-be-context.txt"

    # 1. Folder Blacklist (Diabaikan secara mutlak)
    FORBIDDEN_DIRS = {
        "node_modules", ".git", "dist", "build", "coverage",
        ".vscode", ".idea", "uploads", "temp"
    }

    # 2. Folder Whitelist (Hanya turun ke folder di bawah ini jika di root)
    ALLOWED_DIRS = {
        "src", "prisma", "controllers", "routes", "services", 
        "models", "middlewares", "utils", "config"
    }

    # 3. Ekstensi Berkas Teks Backend yang Diizinkan (.prisma ditambahkan)
    INCLUDE_EXTENSIONS = {".ts", ".js", ".json", ".prisma"}

    # 4. Berkas Konfigurasi Wajib di Tingkat Root
    ESSENTIAL_ROOT_FILES = {"package.json", "tsconfig.json", ".env", ".gitignore"}

    # 5. Batas Maksimum Ukuran Berkas (1 MB)
    MAX_FILE_SIZE_BYTES = 1024 * 1024  

    # Pre-compiled Regex untuk Sensor Keamanan Kunci Privat (Mencegah Kebocoran Key)
    # (.env dikecualikan dari regex karena secara eksplisit diminta masuk oleh pengguna di root)
    SENSITIVE_REGEX = re.compile(
        r"(key.*\.pem|.*\.key|id_rsa.*|credentials.*)", 
        re.IGNORECASE
    )


# =========================================================================
# OPTIMIZER CLASS (Pure Fabrication)
# Pintu gerbang optimasi konten teks dan deteksi data biner
# =========================================================================
class LLMContextOptimizer:
    @staticmethod
    def compress_code(content: str) -> str:
        """Menghapus spasi trailing dan baris kosong ganda secara efisien untuk menghemat token LLM."""
        lines = content.splitlines()
        optimized_lines = []
        previous_empty = False
        
        for line in lines:
            stripped = line.rstrip()
            is_empty = len(stripped) == 0
            
            if is_empty and previous_empty:
                continue
                
            optimized_lines.append(stripped)
            previous_empty = is_empty
            
        return "\n".join(optimized_lines)

    @staticmethod
    def is_binary(file_path: Path) -> bool:
        """Deteksi biner murah dengan membaca 512 byte pertama."""
        try:
            with open(file_path, 'rb') as f:
                return b'\x00' in f.read(512)
        except Exception:
            return True


# =========================================================================
# AGGREGATOR CONTROLLER (GRASP Controller)
# Orkestrator utama penelusuran dan pembangunan bundel berkas teks backend
# =========================================================================
class BackendCodebaseAggregator:
    def __init__(self, target_dir: str, output_name: str):
        self.config = BackendAggregatorConfig()
        self.optimizer = LLMContextOptimizer()
        
        # Penyelarasan Portabilitas Jalur Direktori
        self.target_path = Path(target_dir).resolve()
        if not self.target_path.is_dir():
            self.target_path = Path(__file__).parent.resolve()
            print(f"[SYSTEM] Target direktori tidak ditemukan. Menggunakan fallback portabel di: {self.target_path}")

        self.output_file = self.target_path / output_name
        self.config.ESSENTIAL_ROOT_FILES.add(output_name) # Jangan biarkan skrip membaca file output-nya sendiri

    def _parse_gitignore(self) -> Set[str]:
        """Membaca berkas .gitignore sebagai blacklist otomatis tambahan."""
        ignored_items = set()
        gitignore_path = self.target_path / ".gitignore"
        if gitignore_path.exists():
            try:
                for line in gitignore_path.read_text("utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#"):
                        clean_line = line.replace("/", "").replace("*", "")
                        if clean_line:
                            ignored_items.add(clean_line)
            except Exception as e:
                print(f"[WARN] Gagal mengurai .gitignore: {e}")
        return ignored_items

    def execute(self):
        print(f"🔍 Memulai penggabungan kode backend dari target: {self.target_path}")
        
        # Menggabungkan blacklist default dengan isi .gitignore
        git_ignored = self._parse_gitignore()
        forbidden_dirs_union = self.config.FORBIDDEN_DIRS.union(git_ignored)
        forbidden_files_union = git_ignored # .gitignore file blacklist murni

        file_count = 0
        original_total_size = 0
        compressed_total_size = 0

        try:
            # Membuka file output dengan mode stream buffer langsung
            with open(self.output_file, "w", encoding="utf-8") as out_file:
                out_file.write("=== STRUKTUR & ISI KODE (NODE.JS BACKEND MODE) ===\n\n")

                for root, dirs, files in os.walk(self.target_path):
                    root_path = Path(root)
                    relative_root = root_path.relative_to(self.target_path)
                    is_root_level = len(relative_root.parts) == 0

                    # 1. OPTIMASI I/O: Pangkas folder terlarang dari antrean os.walk
                    dirs[:] = [d for d in dirs if d not in forbidden_dirs_union]

                    # 2. OPTIMASI I/O TINGKAT ROOT: Hanya telusuri folder yang masuk dalam whitelist ALLOWED_DIRS
                    if is_root_level:
                        dirs[:] = [d for d in dirs if d in self.config.ALLOWED_DIRS]

                    for file_name in files:
                        file_path = root_path / file_name
                        relative_file_path = file_path.relative_to(self.target_path)
                        is_root_file = len(relative_file_path.parts) == 1

                        # Cek status file esensial root terlebih dahulu
                        is_essential_root = is_root_file and file_name in self.config.ESSENTIAL_ROOT_FILES

                        # Penapisan A: Sensor Berkas Blacklist & Kunci Privat Sensitif
                        if file_name in forbidden_files_union:
                            continue
                        
                        # Hanya sensor kunci sensitif jika bukan file konfigurasi root wajib (seperti .env)
                        if not is_essential_root and self.config.SENSITIVE_REGEX.match(file_name):
                            continue

                        # Penapisan B: Saring Berkas non-esensial di tingkat Root
                        if is_root_file and not is_essential_root:
                            continue

                        # Penapisan C: Saring Ekstensi yang diizinkan (Kecuali berkas konfigurasi penting root)
                        if not is_essential_root and file_path.suffix not in self.config.INCLUDE_EXTENSIONS:
                            continue

                        # Penapisan D: Cheap Binary Guard (Cegah membaca berkas biner/gambar)
                        if self.optimizer.is_binary(file_path):
                            continue

                        # Penapisan E: Membaca & Mengompresi File
                        try:
                            file_size = file_path.stat().st_size
                            content = file_path.read_text("utf-8", errors="ignore")
                            compressed_content = self.optimizer.compress_code(content)

                            # Tulis langsung ke stream buffer tanpa menahan seluruh isi memori di RAM
                            out_file.write(f"\n--- FILE: {relative_file_path} ---\n")
                            out_file.write(compressed_content)
                            out_file.write("\n")

                            file_count += 1
                            original_total_size += file_size
                            compressed_total_size += len(compressed_content.encode('utf-8'))
                            print(f"-> Menyalin & mengompresi: {relative_file_path}")

                        except Exception as e:
                            print(f"-> Gagal memproses {relative_file_path}: {e}")

            print(f"\n✅ Selesai! {file_count} Berkas Backend berhasil disatukan di:\n   {self.output_file}")
            print(f"📊 Ukuran Asli: {original_total_size / 1024:.2f} KB")
            print(f"🚀 Ukuran Kompresi (LLM Ready): {compressed_total_size / 1024:.2f} KB")
            
            # SINKRONISASI EVALUASI: Perbaikan Typo NameError secara presisi
            if original_total_size > 0:
                saving_percent = ((original_total_size - compressed_total_size) / original_total_size) * 100
                print(f"📉 Penghematan Ruang Konteks: ~{saving_percent:.1f}%")

        except Exception as e:
            print(f"Critical Error: Gagal menulis file output: {e}")


# =========================================================================
# MAIN EXECUTION ENTRY POINT
# =========================================================================
if __name__ == "__main__":
    config_default = BackendAggregatorConfig()

    parser = argparse.ArgumentParser(description="Optimasi Bundel Kode Backend - GFW Paradigm")
    parser.add_argument("--dir", type=str, default=config_default.DEFAULT_TARGET, help="Direktori target yang akan dipindai")
    parser.add_argument("--out", type=str, default=config_default.DEFAULT_OUTPUT, help="Nama berkas keluaran (.txt)")
    
    args = parser.parse_args()

    aggregator = BackendCodebaseAggregator(target_dir=args.dir, output_name=args.out)
    aggregator.execute()