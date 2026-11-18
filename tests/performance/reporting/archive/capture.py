"""Capture Git source and local changes without adding artifacts to the checkout."""
import gzip
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
sys.dont_write_bytecode = True
from snapshot import FILE_LIMIT, TOTAL_LIMIT, FILE_COUNT_LIMIT, MANIFEST_LIMIT, ARCHIVE_LIMIT, regular_bytes, safe_name, sha, verify_snapshot


def capture(root, base, metadata):
    root, base = Path(root).absolute(), Path(base).absolute()
    if set(metadata) != {"revision", "sourceDigest", "dirty"} or not re.fullmatch(r"[a-f0-9]{40}", metadata["revision"]) or not re.fullmatch(r"[a-f0-9]{64}", metadata["sourceDigest"]) or type(metadata["dirty"]) is not bool:
        raise ValueError("Invalid source provenance")
    for path in [root, *root.parents, base, *base.parents]:
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError("Source capture requires real directories")
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = base / metadata["sourceDigest"]
    expression = 'import {sourceProvenance} from "./tests/performance/harness/measurements/provenance"; console.log(JSON.stringify(await sourceProvenance()))'
    current = lambda: json.loads(subprocess.check_output(["bun", "-e", expression], cwd=root))
    if current() != metadata:
        raise ValueError("Source changed before capture")
    if target.exists() or target.is_symlink():
        result = verify_snapshot(target, metadata)
        if current() != metadata:
            raise ValueError("Source changed during snapshot reuse")
        return result
    stage = Path(tempfile.mkdtemp(prefix=".snapshot-", dir=base))
    try:
        names = sorted(set(subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root).decode().split("\0")) - {""})
        if len(names) > FILE_COUNT_LIMIT:
            raise ValueError("Source file count exceeds bound")
        entries, deleted, total = [], [], 0
        archive = stage / "working-tree.tar.gz"
        with archive.open("xb") as destination:
            with gzip.GzipFile(filename="", fileobj=destination, mode="wb", mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode="w") as tar:
                    for name in names:
                        safe_name(name)
                        path = root / name
                        try:
                            info = path.lstat()
                        except FileNotFoundError:
                            deleted.append(name)
                            continue
                        if not stat.S_ISREG(info.st_mode) or not path.resolve().is_relative_to(root):
                            raise ValueError("Source is not a regular local file")
                        for parent in path.relative_to(root).parents:
                            if (root / parent).is_symlink():
                                raise ValueError("Source path traverses a symbolic link")
                        value = regular_bytes(path, FILE_LIMIT)
                        total += len(value)
                        if total > TOTAL_LIMIT:
                            raise ValueError("Source volume exceeds bound")
                        mode = 0o755 if info.st_mode & 0o111 else 0o644
                        member = tarfile.TarInfo(name)
                        member.size, member.mode, member.mtime = len(value), mode, 0
                        tar.addfile(member, io.BytesIO(value))
                        entries.append({"path": name, "sha256": sha(value), "bytes": len(value), "mode": mode})
        archive_hash = sha(regular_bytes(archive, ARCHIVE_LIMIT))
        patch = subprocess.check_output(["git", "diff", "HEAD", "--binary"], cwd=root)
        if len(patch) > FILE_LIMIT:
            raise ValueError("Source patch exceeds bound")
        (stage / "tracked.patch").write_bytes(patch)
        manifest = {"format": 1, **metadata, "files": entries, "deleted": deleted, "fileCount": len(entries), "totalBytes": total, "archiveSha256": archive_hash, "patchSha256": sha(patch)}
        payload = (json.dumps(manifest, indent=2) + "\n").encode()
        if len(payload) > MANIFEST_LIMIT:
            raise ValueError("Source manifest exceeds bound")
        (stage / "snapshot.json").write_bytes(payload)
        seal = {"format": 1, "sourceDigest": metadata["sourceDigest"], "snapshotSha256": sha(payload), "archiveSha256": archive_hash, "patchSha256": sha(patch)}
        (stage / "complete.json").write_text(json.dumps(seal, indent=2) + "\n")
        for path in stage.iterdir():
            path.chmod(0o600)
        verify_snapshot(stage, metadata)
        if current() != metadata:
            raise ValueError("Source changed during snapshot")
        # Only one producer can publish this source identity; never replace an existing snapshot.
        target.mkdir(mode=0o700)
        stage.rename(target)
        return verify_snapshot(target, metadata)
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == "__main__":
    print(json.dumps(capture(sys.argv[1], sys.argv[2], json.load(sys.stdin))))
