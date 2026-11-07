"""Weights (step 9) and service classes (step 12)."""

import re

SCHOOL_SHARE = 39 / 52              # school weeks in one year
NIGHT_SHARE = 0.9                   # share of departures in the night period for a night service
NIGHT_FROM, NIGHT_TO = 23, 6        # night period: clock hours 23:00 to 05:59
DAY_FIRST, DAY_LAST = 9 * 60, 18 * 60   # day service: first departure by 09:00, last from 18:00

DAYS = ("mo", "tu", "we", "th", "fr", "sa", "su")
_DAY = r"\b(mo|tu|we|th|fr|sa|su)[a-z]*"
_RANGE = re.compile(_DAY + r"\s*(?:to|-)\s*" + _DAY.replace(r"\b", ""))


def schedule_days(name):
    """Days in one week that a schedule covers, weighted for school and non-school weeks."""
    text = name.lower().split("/")[0]
    if "non-school" in text:
        share = 1 - SCHOOL_SHARE
    elif "school" in text:
        share = SCHOOL_SHARE
    else:
        share = 1.0
    r = _RANGE.search(text)
    if r:
        days = DAYS.index(r.group(2)) - DAYS.index(r.group(1)) + 1
    else:
        days = len(set(re.findall(_DAY, text)))
    if days <= 0:
        raise ValueError("Cannot find the days of schedule %r" % name)
    return days * share


def weight(journeys):
    return sum(n * schedule_days(name) for name, n in journeys.items())


def match_in_order(predicted, actual):
    """Match each predicted time to one actual time, keeping the time sequence.

    Select the matches with the smallest sum of time differences. Return the
    actual times that have no match. Needs len(predicted) <= len(actual).
    """
    p, a = sorted(predicted), sorted(actual)
    n, m = len(p), len(a)
    INF = float("inf")
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    dp[0] = [0] * (m + 1)
    for i in range(1, n + 1):
        for j in range(i, m + 1):
            dp[i][j] = min(dp[i][j - 1], dp[i - 1][j - 1] + abs(a[j - 1] - p[i - 1]))
    matched, i, j = set(), n, m
    while i > 0:
        if j > i and dp[i][j] == dp[i][j - 1]:
            j -= 1
        else:
            matched.add(j - 1)
            i, j = i - 1, j - 1
    return [t for k, t in enumerate(a) if k not in matched]


def service_class(times, journeys):
    """Classify a pattern from its departure times (schedule -> [minutes])."""
    every = [t for ts in times.values() for t in ts]
    if not every:
        return None
    clock = lambda t: (t // 60) % 24
    night = sum(1 for t in every if clock(t) >= NIGHT_FROM or clock(t) < NIGHT_TO)
    if night >= NIGHT_SHARE * len(every):
        return "night"
    if any(len({clock(t) for t in ts}) == 24 for ts in times.values()):
        return "24-hour"
    main = max(times, key=lambda s: (journeys.get(s, 0), len(times[s])))
    if times[main] and min(times[main]) <= DAY_FIRST and max(times[main]) >= DAY_LAST:
        return "day"
    return "limited"
