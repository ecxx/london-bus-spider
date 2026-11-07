"""Align a fingerprint to the candidates and select one (step 5)."""

from dataclasses import dataclass

REWARD = {3: 10, 2: 8, 1: 5}        # match reward by similarity level
GAP = 1                             # candidate stop before or between matches, with no fingerprint stop
EXTRA = 6                           # fingerprint stop with no candidate stop


@dataclass
class Alignment:
    ci: int                         # index of the candidate
    pairs: list                     # [(fingerprint index, candidate index, level)]
    extra: int                      # fingerprint stops with no candidate stop


def align(level, F, C):
    """Semi-global alignment: all of F is used; C can continue after the last match.

    Returns (pairs, extra). A match wins a tie with a different move. The end
    is the candidate index with the highest score; if equal, the lowest index.
    """
    m, n = len(F), len(C)
    NEG = float("-inf")
    dp = [[NEG] * (n + 1) for _ in range(m + 1)]
    back = [[None] * (n + 1) for _ in range(m + 1)]
    for j in range(n + 1):
        dp[0][j] = -GAP * j
        back[0][j] = "c" if j else None
    lv = [[0] * n for _ in range(m)]
    for i in range(1, m + 1):
        dp[i][0] = dp[i - 1][0] - EXTRA
        back[i][0] = "f"
        for j in range(1, n + 1):
            best, how = dp[i - 1][j] - EXTRA, "f"
            if dp[i][j - 1] - GAP > best:
                best, how = dp[i][j - 1] - GAP, "c"
            lvl = level(F[i - 1], C[j - 1])
            lv[i - 1][j - 1] = lvl
            if lvl and dp[i - 1][j - 1] + REWARD[lvl] >= best:
                best, how = dp[i - 1][j - 1] + REWARD[lvl], "m"
            dp[i][j], back[i][j] = best, how
    j = max(range(n + 1), key=lambda j: (dp[m][j], -j))
    i, pairs, extra = m, [], 0
    while i > 0 or j > 0:
        how = back[i][j]
        if how == "m":
            pairs.append((i - 1, j - 1, lv[i - 1][j - 1]))
            i, j = i - 1, j - 1
        elif how == "f":
            extra += 1
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs, extra


def rank(cand, pairs, extra):
    """The rank of a candidate for one fingerprint. A higher tuple is better.

    1. fewest repeated gap stops: a second visit that the timetable does not show
    2. highest timetable score
    3. SPS before OLR
    4. most gap stops: stops the timetable omits are served
    """
    C = cand.stops
    matched = {p[1] for p in pairs}
    last = max(matched) if matched else -1
    gaps = [j for j in range(last + 1) if j not in matched]        # the pattern starts at 0
    seen = {C[j] for j in matched}
    repeats = sum(1 for j in gaps if C[j] in seen)
    score = sum(REWARD[p[2]] for p in pairs) - EXTRA * extra
    return (-repeats, score, cand.src == "sps", len(gaps))


def select(level, F, cands):
    """Align F to each candidate and return the best Alignment (rule 5: earlier candidate)."""
    best = None
    for ci, cand in enumerate(cands):
        pairs, extra = align(level, F, cand.stops)
        r = rank(cand, pairs, extra) + (-ci,)
        if best is None or r > best[0]:
            best = (r, Alignment(ci, pairs, extra))
    return best[1]
