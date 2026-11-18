"""Bounded source archives: integrity verification never extracts paths to disk."""
import gzip
import hashlib
import io
import json
import os
import re
from pathlib import Path, PurePosixPath
import stat
import sys
import tarfile

FILE_LIMIT = 32 * 1024 ** 2
TOTAL_LIMIT = 256 * 1024 ** 2
ARCHIVE_LIMIT = 128 * 1024 ** 2
MANIFEST_LIMIT = 16 * 1024 ** 2
FILE_COUNT_LIMIT = 10000


def sha(value):
    return hashlib.sha256(value).hexdigest()


def safe_name(value):
    if not isinstance(value, str) or not value:
        raise ValueError("Invalid source path")
    path = PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value or ".." in path.parts or path.parts[0] == ".git" or any(ord(c) < 32 for c in value):
        raise ValueError("Unsafe source path")
    return path


def regular_bytes(path, maximum):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as source:
        metadata = os.fstat(source.fileno())
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > maximum:
            raise ValueError("Source artifact is not a bounded regular file")
        value = source.read(maximum + 1)
        if len(value) != metadata.st_size:
            raise ValueError("Source artifact changed while reading")
        return value


def verify_snapshot(directory, expected=None):
    directory = Path(directory)
    for parent in [directory, *directory.parents]:
        if parent.is_symlink() or not parent.is_dir():
            raise ValueError("Source archive requires real directories")
    raw = regular_bytes(directory / "snapshot.json", MANIFEST_LIMIT)
    manifest = json.loads(raw)
    seal = json.loads(regular_bytes(directory / "complete.json", 4096))
    archive = regular_bytes(directory / "working-tree.tar.gz", ARCHIVE_LIMIT)
    patch = regular_bytes(directory / "tracked.patch", FILE_LIMIT)
    if manifest.get("format") != 1 or seal.get("format") != 1 or seal.get("snapshotSha256") != sha(raw):
        raise ValueError("Source manifest seal mismatch")
    for key, value in [("archiveSha256", archive), ("patchSha256", patch)]:
        if seal.get(key) != sha(value) or manifest.get(key) != sha(value):
            raise ValueError("Source artifact checksum mismatch")
    identity = {key: manifest.get(key) for key in ["revision", "sourceDigest", "dirty"]}
    if not isinstance(identity["revision"], str) or not re.fullmatch(r"[a-f0-9]{40}", identity["revision"]) or not isinstance(identity["sourceDigest"], str) or not re.fullmatch(r"[a-f0-9]{64}", identity["sourceDigest"]) or type(identity["dirty"]) is not bool:
        raise ValueError("Invalid source identity")
    if seal.get("sourceDigest") != identity["sourceDigest"] or (expected is not None and identity != expected):
        raise ValueError("Source identity mismatch")
    rows = manifest.get("files")
    if not isinstance(rows, list) or len(rows) > FILE_COUNT_LIMIT:
        raise ValueError("Source file count exceeds bound")
    names = set()
    total = 0
    for row in rows:
        safe_name(row["path"])
        if row["path"] in names or type(row["bytes"]) is not int or not 0 <= row["bytes"] <= FILE_LIMIT or row["mode"] not in [0o644, 0o755]:
            raise ValueError("Invalid source member")
        names.add(row["path"])
        total += row["bytes"]
    deleted = manifest.get("deleted")
    if not isinstance(deleted, list) or len(deleted) != len(set(deleted)):
        raise ValueError("Invalid deleted source list")
    for name in deleted:
        safe_name(name)
        if name in names:
            raise ValueError("Deleted source appears in archive")
    if total > TOTAL_LIMIT or manifest.get("fileCount") != len(rows) or manifest.get("totalBytes") != total:
        raise ValueError("Source volume mismatch")
    # Bound expansion before tar parsing, including potentially hostile extended headers.
    with gzip.GzipFile(fileobj=io.BytesIO(archive)) as compressed:
        tar_bytes = compressed.read(TOTAL_LIMIT + MANIFEST_LIMIT + 1)
    if len(tar_bytes) > TOTAL_LIMIT + MANIFEST_LIMIT:
        raise ValueError("Expanded source archive exceeds bound")
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:") as tar:
        members = tar.getmembers()
        if len(members) != len(rows) or any(not member.isfile() for member in members):
            raise ValueError("Source archive contains unexpected members")
        by_name = {member.name: member for member in members}
        if len(by_name) != len(members) or set(by_name) != names:
            raise ValueError("Source archive member identity mismatch")
        for row in rows:
            member = by_name[row["path"]]
            if member.size != row["bytes"] or member.mode != row["mode"]:
                raise ValueError("Source member size or mode mismatch")
            value = tar.extractfile(member).read(FILE_LIMIT + 1)
            if sha(value) != row["sha256"]:
                raise ValueError("Source member checksum mismatch")
    return {"path": str(directory.resolve()), "sourceDigest": identity["sourceDigest"], "revision": identity["revision"], "files": len(rows), "bytes": total, "archiveSha256": sha(archive), "manifestSha256": sha(raw)}


if __name__ == "__main__":
    print(json.dumps(verify_snapshot(sys.argv[1])))
