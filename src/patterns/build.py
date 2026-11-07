"""Build the service patterns of one line-direction (steps 4 to 13).

docs/svc_pattern_algorithm.md is the specification. Step numbers in the
comments refer to it.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .align import select
from .candidates import candidates
from .classify import match_in_order, service_class, weight

WEAK_MATCH = 0.9                    # weak_match: less than this share of stops match at level 3


@dataclass
class Fingerprint:
    ti: int                         # index of the TT file
    role: str                       # "origin", "backup" or "late"
    ri: int                         # index of the TT route in the file
    interval: object                # data.Interval
    F: list                         # stop IDs (step 4)
    ci: int = -1                    # selected candidate (step 5)
    pairs: list = field(default_factory=list)
    extra: int = 0
    first: int = -1
    last: int = -1
    short: bool = False             # step 6
    end: int = -1
    drop: set = field(default_factory=set)          # step 7
    pattern: tuple = None           # step 8
    contrib: Counter = None         # journeys that this fingerprint adds to its pattern
    times: dict = field(default_factory=dict)       # departure times of those journeys
    late: bool = False              # pattern from excess journeys
    estimated: bool = False         # step 12 could not separate the late-start times


def _fingerprints(tts):
    """Step 4."""
    out = []
    for ti, t in enumerate(tts):
        for ri, route in enumerate(t.routes):
            for iv in route:
                F = ([t.dep] if t.dep else []) + iv.stops
                F = [x for i, x in enumerate(F) if i == 0 or x != F[i - 1]]
                if F:
                    out.append(Fingerprint(ti=ti, role=t.role, ri=ri, interval=iv, F=F))
    return out


def _ends_with(pattern, tail):
    return len(pattern) >= len(tail) and pattern[len(pattern) - len(tail):] == tail


def pattern_id(line, direction, rank, count):
    pid = "%s-%s" % (line, "I" if direction == "inbound" else "O")
    return pid + str(rank) if count > 1 else pid


def build(ds, key):
    """Return the output record (section 5) of one line-direction."""
    line, direction = key.rsplit("-", 1)
    svc = ds.svc(key)
    tts = ds.timetables(key)
    cands = candidates(svc)
    level = ds.level

    # Step 5.
    fps = _fingerprints(tts) if cands else []
    for fp in fps:
        a = select(level, fp.F, cands)
        fp.ci, fp.pairs, fp.extra = a.ci, a.pairs, a.extra
    fps = [fp for fp in fps if fp.pairs]
    if not fps:
        return _no_timetable(ds, line, direction, cands)
    stops_of = lambda fp: cands[fp.ci].stops
    for fp in fps:
        fp.first, fp.last = fp.pairs[0][1], fp.pairs[-1][1]

    # Step 6: a short working ends at a stop that a different fingerprint passes.
    for fp in fps:
        C = stops_of(fp)
        if fp.last < len(C) - 1:
            end_stop = C[fp.last]
            fp.short = any(stops_of(o)[p[1]] == end_stop
                           for o in fps if o is not fp for p in o.pairs[1:-1])
        fp.end = fp.last if fp.short else len(C) - 1

    # Step 7: a sibling serves a stop inside this fingerprint's span, and this one does not.
    for fp in fps:
        mine = {p[1] for p in fp.pairs}
        for o in fps:
            if o is not fp and (o.ti, o.ri, o.ci) == (fp.ti, fp.ri, fp.ci):
                fp.drop |= {p[1] for p in o.pairs
                            if fp.first < p[1] < fp.last and p[1] not in mine}

    # Step 8.
    primary = {}
    for ti in {fp.ti for fp in fps}:
        firsts = defaultdict(list)
        for fp in fps:
            if fp.ti == ti:
                firsts[fp.ri].append(fp.first)
        primary[ti] = min(firsts, key=lambda ri: (min(firsts[ri]), ri))
    is_primary = lambda fp: primary[fp.ti] == fp.ri

    def keep(fp, lo):
        C = stops_of(fp)
        return tuple(c for j, c in enumerate(C[lo:fp.end + 1], lo) if j not in fp.drop)

    def offset(o, stop):
        """timeToArrival of stop in the interval of o; None if o does not serve it."""
        seq = [tts[o.ti].dep] + o.interval.stops
        tta = [0] + o.interval.tta
        for i, x in enumerate(seq):
            if x and level(x, stop) >= 2:
                return tta[i]
        return None

    def start_times(fp, twins, full):
        """Departure times of the journeys that start at the first stop of fp (step 12)."""
        start = stops_of(fp)[fp.first]
        out = {}
        for sc in fp.contrib:
            actual = fp.interval.times.get(sc, [])
            predicted = []
            for o in twins:
                off = offset(o, start)
                src = o.interval.times if full else o.times
                if off is None:
                    predicted = None
                    break
                predicted += [t + off for t in src.get(sc, [])]
            if predicted is None or len(predicted) > len(actual):
                fp.estimated = True
                out[sc] = list(actual)
            else:
                out[sc] = match_in_order(predicted, actual)
        return out

    def take_excess(fp, twins, full):
        """Keep the journeys of fp that its twins do not give (late-start pattern)."""
        seen = Counter()
        for o in twins:
            seen.update(o.interval.journeys if full else o.contrib)
        fp.pattern = keep(fp, fp.first)
        fp.contrib = Counter({s: n - seen[s] for s, n in fp.interval.journeys.items() if n > seen[s]})
        fp.late = True
        fp.times = start_times(fp, twins, full) if fp.contrib else {}

    def secondary(fp):
        tail = keep(fp, fp.first)
        twins = [o for o in fps if o.ti == fp.ti and is_primary(o) and o.pattern is not None
                 and _ends_with(o.pattern, tail)]
        take_excess(fp, twins, full=True)

    for fp in fps:
        if fp.role != "late" and is_primary(fp):
            fp.pattern = keep(fp, 0)
            fp.contrib = Counter(fp.interval.journeys)
            fp.times = dict(fp.interval.times)
    for fp in fps:
        if fp.role != "late" and not is_primary(fp):
            secondary(fp)
    late_files = sorted({fp.ti for fp in fps if fp.role == "late"},
                        key=lambda ti: min(f.first for f in fps if f.ti == ti and is_primary(f)))
    done = set()
    for ti in late_files:
        for fp in fps:
            if fp.ti == ti and is_primary(fp):
                tail = keep(fp, fp.first)
                twins = [o for o in fps if o is not fp and is_primary(o) and o.contrib is not None
                         and (o.role != "late" or o.ti in done) and _ends_with(o.pattern, tail)]
                take_excess(fp, twins, full=False)
        for fp in fps:
            if fp.ti == ti and not is_primary(fp):
                secondary(fp)
        done.add(ti)

    # Steps 9 and 10.
    merged = {}
    for fp in fps:
        if fp.contrib is None or (fp.late and not fp.contrib):
            continue
        m = merged.setdefault(fp.pattern, dict(journeys=Counter(), times=defaultdict(list), fps=[]))
        m["journeys"].update(fp.contrib)
        for sc, ts in fp.times.items():
            m["times"][sc] += ts
        m["fps"].append(fp)

    # Step 11.
    dests = ds.destinations.get((line, direction), set())
    at_dest = lambda stops: any(level(stops[-1], d) >= 2 for d in dests)
    pats = []
    for stops, m in merged.items():
        pats.append(dict(stops=stops, journeys=m["journeys"], weight=weight(m["journeys"]),
                         times={s: sorted(t) for s, t in m["times"].items()}, fps=m["fps"]))
    pats.sort(key=lambda p: (-p["weight"], not at_dest(p["stops"]), -len(p["stops"])))

    # Steps 12 and 13.
    out = []
    for k, p in enumerate(pats):
        flags = set()
        for fp in p["fps"]:
            C = stops_of(fp)
            if not fp.short and fp.last < len(C) - 1:
                flags.add("tail_extended")
            if fp.short:
                flags.add("short_working")
            if fp.drop:
                flags.add("real_skip")
            if fp.late:
                flags.add("late_start")
            if fp.extra:
                flags.add("extra_stops")
            if sum(1 for q in fp.pairs if q[2] == 3) < WEAK_MATCH * len(fp.F):
                flags.add("weak_match")
            if fp.role == "backup":
                flags.add("backup_timetable")
            if fp.estimated:
                flags.add("class_estimated")
        cand = cands[p["fps"][0].ci]
        if cand.src == "olr":
            flags.add("olr_only")
        if k == 0 and len(pats) > 1 and abs(pats[1]["weight"] - p["weight"]) < 1e-9:
            flags.add("main_tie")
        out.append({
            "id": pattern_id(line, direction, k + 1, len(pats)),
            "main": k == 0,
            "stops": list(p["stops"]),
            "weeklyJourneys": round(p["weight"], 2),
            "journeys": dict(sorted(p["journeys"].items())),
            "serviceClass": service_class(p["times"], p["journeys"]),
            "candidate": cand.label,
            "flags": sorted(flags),
        })
    full = {p["stops"] for p in pats}
    unconfirmed = [{"stops": list(c.stops), "candidate": c.label}
                   for c in cands if c.src == "sps" and c.stops not in full]
    return _record(ds, line, direction, out, unconfirmed)


def _no_timetable(ds, line, direction, cands):
    """Step 13: a line-direction with no fingerprint. Every SPS candidate is a pattern."""
    sps = sorted((c for c in cands if c.src == "sps"), key=lambda c: -len(c.stops))
    out = [{
        "id": pattern_id(line, direction, k + 1, len(sps)),
        "main": k == 0,
        "stops": list(c.stops),
        "weeklyJourneys": 0.0,
        "journeys": {},
        "serviceClass": None,
        "candidate": c.label,
        "flags": ["no_timetable"],
    } for k, c in enumerate(sps)]
    return _record(ds, line, direction, out, [])


def _record(ds, line, direction, patterns, unconfirmed):
    return {"dataset": ds.name, "lineId": line, "direction": direction,
            "patterns": patterns, "unconfirmedPaths": unconfirmed}
