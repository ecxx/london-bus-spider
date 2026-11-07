"""The data that the application loads, from one data folder.

Implements docs/export_format.md.

    from export import build
    files = build("data/data_131026")      # {"stops": ..., "stations": ..., "patterns": ..., "lines": ...}
"""

from .build import build, write

__all__ = ["build", "write"]
