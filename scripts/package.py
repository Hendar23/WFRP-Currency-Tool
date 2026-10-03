"""Validate and package the module without including repository or campaign data."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "wfrp4e-currency-toolbox"
OUT = ROOT / "release-assets"
manifest_bytes = (MODULE / "module.json").read_bytes()
manifest = json.loads(manifest_bytes)
assert manifest["id"] == MODULE.name
assert manifest["version"] and not manifest["version"].startswith("v")
assert manifest["download"] == (
    f'https://github.com/Hendar23/WFRP-Currency-Tool/releases/download/{manifest["version"]}/module.zip'
)
assert manifest["manifest"] == (
    "https://raw.githubusercontent.com/Hendar23/WFRP-Currency-Tool/main/wfrp4e-currency-toolbox/module.json"
)
for key in ("esmodules", "styles"):
    for name in manifest[key]:
        assert (MODULE / name).is_file(), f"Missing {name}"
assert (MODULE / "templates/toolbox.hbs").is_file()
paths = sorted(p for p in MODULE.rglob("*") if p.is_file())
assert all(not any(part.startswith(".") for part in p.relative_to(MODULE).parts) for p in paths)
OUT.mkdir(exist_ok=True)
(OUT / "module.json").write_bytes(manifest_bytes)
with ZipFile(OUT / "module.zip", "w", compression=ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, path.relative_to(MODULE).as_posix())
with ZipFile(OUT / "module.zip") as archive:
    assert archive.testzip() is None
    assert archive.read("module.json") == manifest_bytes
    assert set(archive.namelist()) == {p.relative_to(MODULE).as_posix() for p in paths}
print(f'Validated and packaged {manifest["id"]} {manifest["version"]}: {len(paths)} files.')
