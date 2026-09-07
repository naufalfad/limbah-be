#!/usr/bin/env python3
# bum.py — Universal Codebase Aggregator for E-LIMBAD (Backend & Frontend Compatible)
import os
import sys
import re
import argparse
import fnmatch
from pathlib import Path
from typing import Set, List, Tuple, Optional

# Set console output encoding to UTF-8 to prevent UnicodeEncodeError on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# =========================================================================
# CONFIGURATION CLASS (Information Expert)
# Menyimpan seluruh konfigurasi penapisan secara terpusat untuk BE & FE
# =========================================================================
class AggregatorConfig:
    # 1. Folder Blacklist (Diabaikan secara mutlak pada kedalaman berapapun)
    FORBIDDEN_DIRS: Set[str] = {
        # Dependencies & Version Control
        "node_modules", ".git", ".svn", ".hg",
        # Build artifacts & caches (BE & FE)
        "dist", "build", "out", "coverage", ".next", ".nuxt", ".output",
        "dist-ssr", "storybook-static", ".turbo", ".parcel-cache",
        # IDE & Editors
        ".vscode", ".idea", ".swc",
        # Temporary, Caches & Logs
        "recovered", "temp", "tmp", ".cache", ".yarn", "logs", "__pycache__",
        # Uploads & Storage (BE user files)
        "uploads", "storage",
        # Raw GIS / Heavy spatial data directories (FE & BE)
        "geojson"
    }

    # 2. Berkas Blacklist (Diabaikan secara mutlak)
    FORBIDDEN_FILES: Set[str] = {
        # Package manager lockfiles
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
        # OS / Editor junk
        ".DS_Store", "Thumbs.db", "desktop.ini",
        # Build metadata
        "tsconfig.tsbuildinfo",
        # Heavy GIS / Mock raw data (multi-megabyte files in project)
        "kotim-desa.json", "kotim-kecamatan.json", "bogor-sungai-line.json",
        "bogor-sungai-poly.json", "bogor-desa.json", "bogor-kecamatan.json",
        "kotim-sungai-line.json", "kotim-sungai-poly.json",
        "mock-data.json", "sample-geojson.json",
        # Binary documents & archives in workspace
        "dummy.pdf", "rkl_dummy.xlsx", "rpl_dummy.xlsx", "companies.rar",
        "contoh perusahaan 1.xlsx", "contoh rkl 1.xlsx", "contoh rpl 1.xlsx",
        "template-sppl.docx", "template-ukl-upl.xlsx",
        # Berkas output agregator sebelumnya (mencegah duplikasi rekursif)
        "limbah-be.txt", "limbah-fe.txt", "limbah-be-context.txt",
        "limbah-fe-gis-only.txt", "limbah-fe-non-gis.txt",
        "elimbad-fullstack.txt", "E-LIMBAD.txt", "bum.txt"
    }

    # 3. Ekstensi Biner & Media yang langsung diabaikan tanpa dibaca
    IGNORE_EXTENSIONS: Set[str] = {
        # Images & Vectors
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".tiff",
        # Documents & Spreadsheets
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        # Archives & Compressed
        ".zip", ".rar", ".7z", ".tar", ".gz",
        # Audio / Video
        ".mp4", ".mp3", ".wav", ".avi", ".mov",
        # Fonts
        ".woff", ".woff2", ".ttf", ".eot", ".otf",
        # Sourcemaps
        ".map"
    }

    # 4. Whitelist Folder Tingkat Root yang Diizinkan untuk Ditelusuri
    ALLOWED_DIRS: Set[str] = {
        # Subprojects / Monorepo directories
        "limbah-be", "limbah-fe", "backend", "frontend", "client", "server", "api", "web", "apps", "packages",
        # Source code & logic (BE & FE)
        "src", "prisma", "public", "components", "pages", "hooks", "utils", "helpers",
        "lib", "store", "types", "modules", "common", "controllers", "services",
        "repositories", "interfaces", "parsers", "providers", "dtos", "dto",
        "entities", "models", "validators", "jobs", "queues", "migrations",
        "seeders", "filters", "pipes", "interceptors", "guards", "decorators",
        "adapters", "factories", "enums", "routes", "middlewares", "config",
        "styles", "layouts", "views", "context", "schemas", "assets"
    }

    # 5. Ekstensi Berkas Teks yang Diizinkan (Fullstack BE & FE)
    INCLUDE_EXTENSIONS: Set[str] = {
        # TypeScript & JavaScript
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
        # Stylesheets (Frontend)
        ".css", ".scss", ".sass", ".less",
        # Web Markup / Templates
        ".html", ".vue", ".svelte",
        # Schemas, Configs & Query Languages
        ".json", ".prisma", ".yaml", ".yml", ".sql", ".graphql", ".gql",
        # Documentation & Shell
        ".md", ".env.example", ".sh"
    }

    # 6. Berkas Konfigurasi Penting di Tingkat Root (BE & FE)
    ESSENTIAL_ROOT_FILES: Set[str] = {
        # Package & dependencies
        "package.json",
        # TypeScript configs
        "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "tsconfig.base.json",
        # Bundlers & Web frameworks
        "vite.config.ts", "vite.config.js", "vite.config.mjs",
        "next.config.js", "next.config.mjs", "next.config.ts",
        "nest-cli.json", "index.html",
        # CSS & UI toolchains
        "tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs",
        "postcss.config.js", "postcss.config.cjs", "postcss.config.mjs",
        "components.json",
        # Linters & formatters
        "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs",
        ".eslintrc.js", ".eslintrc.json", ".eslintrc.cjs",
        ".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.yaml", ".prettierrc.yml",
        # Server & Container configs
        "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
        "server.js", "app.js", "index.js", "nodemon.json",
        # Testing
        "jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js",
        # Database & Environment
        "schema.prisma", ".env.example", "README.md"
    }

    # 7. Batas Maksimum Ukuran Berkas (1 MB)
    MAX_FILE_SIZE_BYTES: int = 1024 * 1024  

    # Pre-compiled Regex untuk Sensor Keamanan (Mencegah Kebocoran Kredensial / Secret)
    SENSITIVE_REGEX = re.compile(
        r"(\.env($|\..*)|key.*\.pem|.*\.key|id_rsa.*|credentials.*)", 
        re.IGNORECASE
    )


# =========================================================================
# OPTIMIZER CLASS (Pure Fabrication)
# Pintu gerbang optimasi konten teks dan deteksi data biner
# =========================================================================
class LLMContextOptimizer:
    @staticmethod
    def strip_js_ts_comments(text: str) -> str:
        """Menghapus komentar // dan /* ... */ secara aman tanpa merusak string literal atau template string."""
        pattern = re.compile(
            r'/\*.*?\*/|//.*?$|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"|`(?:\\.|[^\\`])*`',
            re.DOTALL | re.MULTILINE
        )
        def replacer(match):
            s = match.group(0)
            if s.startswith('/'):
                return ""
            return s
        return re.sub(pattern, replacer, text)

    @staticmethod
    def strip_css_comments(text: str) -> str:
        """Menghapus komentar CSS /* ... */ dan // (SCSS) tanpa merusak URL string."""
        pattern = re.compile(
            r'/\*.*?\*/|//.*?$|\'(?:\\.|[^\\\'])*\'|"(?:\\.|[^\\"])*"',
            re.DOTALL | re.MULTILINE
        )
        def replacer(match):
            s = match.group(0)
            if s.startswith('/'):
                return ""
            return s
        return re.sub(pattern, replacer, text)

    @staticmethod
    def strip_html_comments(text: str) -> str:
        """Menghapus komentar HTML <!-- ... -->."""
        return re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)

    @classmethod
    def compress_code(cls, content: str, suffix: str = "", strip_comments: bool = True) -> str:
        """Menghapus spasi trailing, baris kosong ganda, dan komentar sesuai bahasa."""
        if strip_comments:
            if suffix in (".js", ".jsx", ".ts", ".tsx", ".prisma"):
                content = cls.strip_js_ts_comments(content)
            elif suffix in (".css", ".scss", ".sass", ".less"):
                content = cls.strip_css_comments(content)
            elif suffix in (".html", ".vue", ".svelte"):
                content = cls.strip_html_comments(content)

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
        """Deteksi biner cepat dengan membaca 512 byte pertama."""
        try:
            with open(file_path, 'rb') as f:
                return b'\x00' in f.read(512)
        except Exception:
            return True


# =========================================================================
# AGGREGATOR CONTROLLER (GRASP Controller)
# Orkestrator utama penelusuran dan pembangunan bundel berkas teks
# =========================================================================
class CodebaseAggregator:
    def __init__(
        self, 
        target_dir: Optional[str] = None, 
        output_name: Optional[str] = None, 
        strip_comments: bool = True, 
        exclude_tests: bool = False,
        scope: str = "auto"
    ):
        self.config = AggregatorConfig()
        self.optimizer = LLMContextOptimizer()
        self.strip_comments = strip_comments
        self.exclude_tests = exclude_tests
        self.scope = scope.lower()

        # Deteksi Jalur Proyek & Penentuan Target Cerdas
        self.repo_root, self.be_dir, self.fe_dir = self._detect_project_topology()
        self.target_path = self._resolve_target_dir(target_dir)
        self.output_file = self._resolve_output_file(output_name)

        # Lindungi file output & skrip saat ini agar tidak membaca dirinya sendiri
        self.config.FORBIDDEN_FILES.add(self.output_file.name)
        self.config.FORBIDDEN_FILES.add(Path(__file__).name)
        
        # Parse pola dari semua file .gitignore yang relevan
        self.gitignore_patterns = self._parse_gitignore()

    def _detect_project_topology(self) -> Tuple[Path, Optional[Path], Optional[Path]]:
        """Mendeteksi posisi repo root serta folder limbah-be dan limbah-fe secara otomatis."""
        script_dir = Path(__file__).parent.resolve()
        cwd = Path.cwd().resolve()

        # Calon-calon direktori root
        candidates = [cwd, script_dir, script_dir.parent, cwd.parent]
        for candidate in candidates:
            be_cand = candidate / "limbah-be"
            fe_cand = candidate / "limbah-fe"
            if be_cand.is_dir() or fe_cand.is_dir():
                return candidate, (be_cand if be_cand.is_dir() else None), (fe_cand if fe_cand.is_dir() else None)

        # Fallback jika tidak terdeteksi
        return script_dir, None, None

    def _resolve_target_dir(self, target_dir: Optional[str]) -> Path:
        """Menentukan direktori target berdasarkan parameter --dir atau --scope."""
        if target_dir:
            p = Path(target_dir).resolve()
            if p.is_dir():
                return p
            print(f"[WARN] Target direktori '{target_dir}' tidak ditemukan. Menggunakan fallback.")

        # Resolusi berdasarkan scope
        if self.scope == "be":
            if self.be_dir and self.be_dir.is_dir():
                return self.be_dir
            if Path(__file__).parent.name == "limbah-be":
                return Path(__file__).parent.resolve()

        elif self.scope == "fe":
            if self.fe_dir and self.fe_dir.is_dir():
                return self.fe_dir
            if (self.repo_root / "limbah-fe").is_dir():
                return self.repo_root / "limbah-fe"

        elif self.scope == "all":
            return self.repo_root

        # Auto detection
        cwd = Path.cwd().resolve()
        script_dir = Path(__file__).parent.resolve()

        # Jika CWD berada di dalam be atau fe, gunakan CWD
        if cwd.name in ("limbah-be", "limbah-fe"):
            return cwd
        # Jika script berada di limbah-be dan dijalankan tanpa argumen
        if script_dir.name in ("limbah-be", "limbah-fe"):
            return script_dir
        # Jika CWD adalah root yang memiliki be & fe
        if (cwd / "limbah-be").is_dir() and (cwd / "limbah-fe").is_dir():
            return cwd

        return script_dir

    def _resolve_output_file(self, output_name: Optional[str]) -> Path:
        """Menentukan nama dan lokasi berkas keluaran secara cerdas."""
        if output_name:
            out_p = Path(output_name)
            if out_p.is_absolute():
                return out_p
            return self.target_path / output_name

        # Penamaan otomatis berbasis target
        t_name = self.target_path.name.lower()
        if "be" in t_name or "backend" in t_name:
            default_name = "limbah-be.txt"
        elif "fe" in t_name or "frontend" in t_name:
            default_name = "limbah-fe.txt"
        elif self.target_path == self.repo_root:
            default_name = "elimbad-fullstack.txt"
        else:
            default_name = f"{self.target_path.name}.txt"

        return self.target_path / default_name

    def _parse_gitignore(self) -> List[str]:
        """Membaca berkas .gitignore di target dan subfolder utama sebagai daftar pola."""
        patterns: List[str] = []
        possible_gitignores = [self.target_path / ".gitignore"]
        
        # Tambahkan subfolder gitignore jika target adalah monorepo root
        for sub in ("limbah-be", "limbah-fe"):
            sub_gi = self.target_path / sub / ".gitignore"
            if sub_gi.exists():
                possible_gitignores.append(sub_gi)

        for gi_path in possible_gitignores:
            if gi_path.exists():
                try:
                    rel_dir = gi_path.parent.relative_to(self.target_path).as_posix()
                    prefix = "" if rel_dir == "." else f"{rel_dir}/"
                    for line in gi_path.read_text("utf-8").splitlines():
                        line = line.strip()
                        if line and not line.startswith("#"):
                            if prefix and '/' in line:
                                patterns.append(f"{prefix}{line.lstrip('/')}")
                            else:
                                patterns.append(line)
                except Exception as e:
                    print(f"[WARN] Gagal mengurai {gi_path}: {e}")
        return patterns

    def should_ignore(self, path: Path, is_dir: bool = False) -> bool:
        """Memeriksa apakah berkas atau folder harus diabaikan berdasarkan blacklist dan gitignore."""
        try:
            rel_path = path.relative_to(self.target_path)
        except ValueError:
            rel_path = path
            
        parts = rel_path.parts
        if not parts:
            return False

        # 1. Cek folder blacklist bawaan pada komponen path manapun
        for part in parts:
            if part in self.config.FORBIDDEN_DIRS:
                return True

        # 2. Cek berkas jika bukan direktori
        if not is_dir:
            name_lower = path.name.lower()
            suffix_lower = path.suffix.lower()

            # Filter berkas blacklist eksplisit
            if path.name in self.config.FORBIDDEN_FILES or name_lower in self.config.FORBIDDEN_FILES:
                return True

            # Filter ekstensi biner & media langsung
            if suffix_lower in self.config.IGNORE_EXTENSIONS:
                return True

            # Sensor Berkas Kredensial Sensitif (.env, key.pem, credentials)
            if self.config.SENSITIVE_REGEX.match(path.name):
                return True

            # Abaikan berkas .txt hasil agregasi sebelumnya agar tidak terjadi inflasi rekursif
            if suffix_lower == ".txt" and path.name != self.output_file.name:
                if any(kw in name_lower for kw in ("context", "bundle", "aggregator", "limbah", "gis", "fullstack", "non-gis")):
                    return True

            # Filter Berkas Pengujian (Unit Test/E2E) jika parameter diaktifkan
            if self.exclude_tests:
                if "test" in name_lower or "spec" in name_lower:
                    if suffix_lower in (".ts", ".tsx", ".js", ".jsx"):
                        return True

        # 3. Filter folder khusus pengujian secara mutlak jika exclude_tests
        if self.exclude_tests and is_dir:
            if path.name.lower() in ("tests", "__tests__", "cypress", "playwright"):
                return True

        # 4. Cek kecocokan dengan pola gitignore
        rel_path_str = rel_path.as_posix()
        for pattern in self.gitignore_patterns:
            clean_pattern = pattern.lstrip('/')
            is_pattern_dir = pattern.endswith('/')
            match_pattern = clean_pattern.rstrip('/')
            
            if is_pattern_dir and not is_dir:
                continue
                
            if '/' in match_pattern:
                if fnmatch.fnmatch(rel_path_str, match_pattern) or fnmatch.fnmatch(rel_path_str, f"{match_pattern}/*"):
                    return True
            else:
                if any(fnmatch.fnmatch(part, match_pattern) for part in parts):
                    return True
                    
        return False

    def execute(self):
        print("=" * 70)
        print(f"🚀 E-LIMBAD CODEBASE AGGREGATOR (BE & FE)")
        print(f"📁 Target Direktori : {self.target_path}")
        print(f"📄 Berkas Keluaran  : {self.output_file}")
        if self.strip_comments:
            print("✂️  Optimasi         : Pembersihan komentar aktif (TS/JS/CSS/HTML/Prisma)")
        else:
            print("💬 Komentar         : Dipertahankan (--keep-comments)")
        if self.exclude_tests:
            print("🚫 Pengujian        : Berkas test/spec diabaikan (--exclude-tests)")
        print("=" * 70)
            
        file_count = 0
        original_total_size = 0
        compressed_total_size = 0
        
        processed_files_stats: List[Tuple[str, int]] = []

        # Tentukan label konteks
        t_name = self.target_path.name.lower()
        if "fe" in t_name or "frontend" in t_name:
            scope_title = "FRONTEND CODEBASE BUNDLE (React / Vite / Tailwind / TypeScript)"
        elif "be" in t_name or "backend" in t_name:
            scope_title = "BACKEND CODEBASE BUNDLE (Express / NestJS / Prisma / TypeScript)"
        else:
            scope_title = "FULLSTACK CODEBASE BUNDLE (Frontend & Backend E-LIMBAD)"

        try:
            with open(self.output_file, "w", encoding="utf-8") as out_file:
                out_file.write(f"=== E-LIMBAD CODEBASE CONTEXT: {scope_title} ===\n\n")

                for root, dirs, files in os.walk(self.target_path):
                    root_path = Path(root)
                    relative_root = root_path.relative_to(self.target_path)
                    is_root_level = len(relative_root.parts) == 0

                    # 1. Pangkas folder terlarang dari antrean os.walk
                    dirs[:] = [d for d in dirs if not self.should_ignore(root_path / d, is_dir=True)]

                    # 2. OPTIMASI I/O TINGKAT ROOT:
                    # Di root, hanya telusuri folder yang diizinkan, atau folder subproyek (yang memiliki package.json)
                    if is_root_level:
                        dirs[:] = [
                            d for d in dirs
                            if d in self.config.ALLOWED_DIRS
                            or (root_path / d / "package.json").exists()
                            or any(d.startswith(prefix) for prefix in self.config.ALLOWED_DIRS)
                        ]

                    for file_name in files:
                        file_path = root_path / file_name
                        relative_file_path = file_path.relative_to(self.target_path)
                        is_root_file = len(relative_file_path.parts) == 1

                        # Penapisan A: Sensor Berkas Sensitif, Blacklist & Gitignore
                        if self.should_ignore(file_path, is_dir=False):
                            continue

                        # Penapisan B & C: Saring Ekstensi & Berkas Esensial
                        is_essential = file_name in self.config.ESSENTIAL_ROOT_FILES
                        if not is_essential and file_path.suffix not in self.config.INCLUDE_EXTENSIONS:
                            continue

                        # Jika berkas berada di root langsung dan bukan file konfigurasi esensial:
                        # jangan masukkan berkas acak (seperti file catatan/markdown sementara)
                        if is_root_file and not is_essential:
                            if file_path.suffix not in self.config.INCLUDE_EXTENSIONS or file_path.suffix in (".json", ".md", ".txt"):
                                continue

                        # Penapisan D: Cheap Binary Guard
                        if self.optimizer.is_binary(file_path):
                            continue

                        # Penapisan E: Size Guard
                        try:
                            file_size = file_path.stat().st_size
                            if file_size > self.config.MAX_FILE_SIZE_BYTES:
                                print(f"[SKIP] Berkas melebihi 1 MB ({file_size / 1024:.1f} KB): {relative_file_path}")
                                continue

                            content = file_path.read_text("utf-8", errors="ignore")
                            compressed_content = self.optimizer.compress_code(
                                content, 
                                suffix=file_path.suffix, 
                                strip_comments=self.strip_comments
                            )

                            # Tulis langsung ke stream buffer dengan format posix path universal
                            out_file.write(f"\n--- FILE: {relative_file_path.as_posix()} ---\n")
                            out_file.write(compressed_content)
                            out_file.write("\n")

                            file_count += 1
                            comp_size = len(compressed_content.encode('utf-8'))
                            original_total_size += file_size
                            compressed_total_size += comp_size
                            
                            processed_files_stats.append((str(relative_file_path.as_posix()), comp_size))
                            print(f"-> Menyalin & mengompresi: {relative_file_path.as_posix()}")

                        except Exception as e:
                            print(f"-> Gagal memproses {relative_file_path}: {e}")

            print("\n" + "=" * 70)
            print(f"✅ Penggabungan Berhasil!")
            print(f"📦 Total Berkas Disatukan : {file_count}")
            print(f"📍 Berkas Keluaran       : {self.output_file}")
            print(f"📊 Ukuran Asli           : {original_total_size / 1024:.2f} KB")
            print(f"🚀 Ukuran Terkompresi    : {compressed_total_size / 1024:.2f} KB (LLM Context Ready)")
            
            if original_total_size > 0:
                saving_percent = ((original_total_size - compressed_total_size) / original_total_size) * 100
                print(f"📉 Efisiensi Konteks     : ~{saving_percent:.1f}% dihemat")
                
            if processed_files_stats:
                print("\n📋 15 Berkas Terbesar dalam Bundel:")
                sorted_files = sorted(processed_files_stats, key=lambda x: x[1], reverse=True)
                for idx, (f_path, f_size) in enumerate(sorted_files[:15], 1):
                    print(f"   {idx:2d}. {f_path} ({f_size / 1024:.2f} KB)")
            print("=" * 70)

        except Exception as e:
            print(f"Critical Error: Gagal menulis file output: {e}")


# =========================================================================
# MAIN EXECUTION ENTRY POINT
# =========================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="E-LIMBAD Codebase Aggregator — Menyatukan kode Backend & Frontend secara bersih & optimal untuk LLM Context"
    )
    parser.add_argument(
        "--scope", 
        choices=["auto", "be", "fe", "all"], 
        default="auto", 
        help="Cakupan bundel: 'be' (Backend), 'fe' (Frontend), 'all' (Fullstack), 'auto' (otomatis mendeteksi)"
    )
    parser.add_argument("--be", action="store_true", help="Shortcut untuk --scope be")
    parser.add_argument("--fe", action="store_true", help="Shortcut untuk --scope fe")
    parser.add_argument("--all", action="store_true", help="Shortcut untuk --scope all")
    parser.add_argument("--dir", type=str, default=None, help="Direktori target spesifik yang akan dipindai")
    parser.add_argument("--out", type=str, default=None, help="Nama atau jalur berkas keluaran (.txt)")
    parser.add_argument("--keep-comments", action="store_true", help="Pertahankan komentar di dalam kode")
    parser.add_argument("--exclude-tests", action="store_true", help="Jangan sertakan berkas pengujian (*.test.*, *.spec.*)")
    
    args = parser.parse_args()

    # Evaluasi scope shortcut flags
    selected_scope = args.scope
    if args.be:
        selected_scope = "be"
    elif args.fe:
        selected_scope = "fe"
    elif args.all:
        selected_scope = "all"

    aggregator = CodebaseAggregator(
        target_dir=args.dir, 
        output_name=args.out,
        strip_comments=not args.keep_comments,
        exclude_tests=args.exclude_tests,
        scope=selected_scope
    )
    aggregator.execute()