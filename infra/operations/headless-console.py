#!/usr/bin/env python3
"""Detach only a Cirrus framebuffer console when a serial console is active."""
import argparse
from pathlib import Path


def detach(sysfs: Path) -> list[str]:
    active = (sysfs / "class/tty/console/active").read_text().split()
    if not any(name.startswith(("ttyS", "hvc")) for name in active):
        raise RuntimeError("An active serial console is required")
    drivers = sysfs / "bus/pci/drivers/cirrus-qemu"
    if not drivers.is_dir() or not any(name.name.startswith("0000:") for name in drivers.iterdir()):
        return []
    detached = []
    for console in sorted((sysfs / "class/vtconsole").glob("vtcon*")):
        if "frame buffer" in (console / "name").read_text().lower():
            bind = console / "bind"
            if bind.read_text().strip() == "1":
                bind.write_text("0\n")
                detached.append(console.name)
    return detached


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sysfs", type=Path, default=Path("/sys"))
    options = parser.parse_args()
    print("Detached framebuffer consoles:", ", ".join(detach(options.sysfs)) or "none")


if __name__ == "__main__":
    main()
