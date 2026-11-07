"""Service patterns of London bus line-directions.

Implements docs/svc_pattern_algorithm.md.

    from patterns import Dataset, build
    ds = Dataset.from_name("data_131026")
    record = build(ds, "313-inbound")
"""

from .build import build
from .data import Dataset

__all__ = ["Dataset", "build", "build_all"]


def build_all(ds, keys=None):
    """Return {line-direction: record} for keys, or for every line-direction."""
    return {key: build(ds, key) for key in (keys or ds.keys())}
