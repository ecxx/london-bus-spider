"""Make the candidate stop sequences of a line-direction (step 3)."""

from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class Candidate:
    stops: tuple
    src: str                        # "sps" or "olr"
    label: str                      # for example "sps:1>4>2>4>3" or "olr:0"


def sps_paths(sequences):
    """All paths through the SPS branch graph, as candidates.

    Branches with the same branchId are alternatives. A branch's reference to
    itself is dropped, so a one-branch circular route gives one lap. Each edge
    is used at most once in one path, so a loop through another branch
    (b11-outbound: 1>4>2>4>3) is kept.
    """
    groups = defaultdict(list)      # branchId -> [stop lists]
    nexts = defaultdict(set)
    for q in sequences:
        b = q["branchId"]
        groups[b].append([p["id"] for p in q["stopPoint"]])
        nexts[b].update(q["nextBranchIds"])
    ids = set(groups)
    succ = {b: sorted((nexts[b] & ids) - {b}) for b in ids}
    has_pred = {n for b in ids for n in succ[b]}
    sources = sorted(b for b in ids if b not in has_pred) or sorted(ids)

    paths = []

    def walk(b, used, path):
        path = path + [b]
        outs = [n for n in succ[b] if (b, n) not in used]
        if not outs:
            paths.append(path)
        for n in outs:
            walk(n, used | {(b, n)}, path)

    for s in sources:
        walk(s, frozenset(), [])

    out = []
    for path in paths:
        combos = [[]]
        for b in path:
            combos = [c + [(b, k)] for c in combos for k in range(len(groups[b]))]
        for combo in combos:
            seq = []
            for b, k in combo:
                part = groups[b][k]
                if seq and part and seq[-1] == part[0]:
                    part = part[1:]
                seq += part
            label = ">".join(str(b) + ("#%d" % k if len(groups[b]) > 1 else "") for b, k in combo)
            out.append(Candidate(tuple(seq), "sps", "sps:" + label))
    return out


def candidates(svc):
    """SPS candidates in walk order, then OLR candidates. No two have the same stop list."""
    cands = sps_paths(svc.get("stopPointSequences", []))
    cands += [Candidate(tuple(r["naptanIds"]), "olr", "olr:%d" % i)
              for i, r in enumerate(svc.get("orderedLineRoutes", []))]
    seen, out = set(), []
    for c in cands:
        if c.stops and c.stops not in seen:
            seen.add(c.stops)
            out.append(c)
    return out
