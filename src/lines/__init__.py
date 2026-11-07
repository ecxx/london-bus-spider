"""The line of each service pattern, from the lineStrings of the svc files.

Implements docs/svc_line_algorithm.md.

    from lines import build
    lines = build("data/data_131026")                  # {pattern id: record}
    lines = build("data/data_131026", ["1-outbound"])
"""

from .build import build

__all__ = ["build"]
