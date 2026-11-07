"""Stops and stations of one data folder, with the patterns that serve each stop.

    from stops import build
    stops, stations = build("data/data_131026")
"""

from .build import build

__all__ = ["build"]
