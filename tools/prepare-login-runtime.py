"""Stage only interpreter, login packages and browser binaries, never user profiles."""
import shutil
import sys
import zipfile
from pathlib import Path

from camoufox.pkgman import camoufox_path

root = Path(__file__).resolve().parent.parent
stage = root / '.runtime' / 'distribution' / 'login-runtime'
python = stage / 'python'
base = Path(sys.base_prefix)
python.mkdir(parents=True, exist_ok=True)
for pattern in ('python*.exe', 'python*.dll', 'vcruntime*.dll', 'LICENSE.txt'):
    for source in base.glob(pattern):
        shutil.copy2(source, python / source.name)
for directory in ('DLLs', 'Lib'):
    shutil.copytree(base / directory, python / directory, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('site-packages', '__pycache__', 'test', 'tests', 'idlelib', 'tkinter', 'ensurepip'))
shutil.copytree(Path(sys.prefix) / 'Lib/site-packages', python / 'Lib/site-packages',
                dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', 'pip', 'pip-*', 'setuptools', 'setuptools-*'))
shutil.copytree(camoufox_path(), stage / 'camoufox', dirs_exist_ok=True)
shutil.copy2(root / 'tools/turnstile_solver.py', stage / 'turnstile_solver.py')
assert (stage / 'camoufox/camoufox.exe').is_file()
print(f'Login runtime staged: {stage}')
archive = stage.parent / 'login-runtime.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    for source in stage.rglob('*'):
        if source.is_file():
            package.write(source, source.relative_to(stage.parent))
print(f'Login archive: {archive.stat().st_size // (1024 * 1024)} MB')
