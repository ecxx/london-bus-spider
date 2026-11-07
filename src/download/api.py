"""TfL API access: throttled, retried GETs, and file writes that never leave a truncated file."""

import json
import os
import threading
import time
import urllib.parse

import requests

API = "https://api.tfl.gov.uk"
APP_KEY = os.environ.get("TFL_APP_KEY", "")
WORKERS = 6
RETRIES = 3
TIMEOUT = 60
RATE_PER_SEC = 8

# Cloudflare sits in front of the TfL API and bans some client User-Agents
# (e.g. Python-urllib) with "error code: 1010" (HTTP 403). It accepts the
# requests default today, but send a browser UA so a policy change cannot break
# the download.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"


class NotFound(Exception):
    pass


class FetchFailed(Exception):
    pass


class Fatal(Exception):
    """A failure that retrying, or any other request, will not fix."""


# ---- throttle ---------------------------------------------------------------
_lock = threading.Lock()
_next = [0.0]


def wait_turn():
    with _lock:
        now = time.time()
        due = max(now, _next[0])
        _next[0] = due + 1.0 / RATE_PER_SEC
    if due > now:
        time.sleep(due - now)


# ---- fetch ------------------------------------------------------------------
_local = threading.local()


def session():
    """One Session per worker thread, so each thread reuses its own connection."""
    s = getattr(_local, "session", None)
    if s is None:
        s = _local.session = requests.Session()
        s.headers["User-Agent"] = UA
    return s


def fetch(path, **params):
    """GET API + path. Return (raw body, parsed JSON)."""
    params["app_key"] = APP_KEY

    for attempt in range(RETRIES):
        retry = attempt < RETRIES - 1
        wait_turn()
        try:
            r = session().get(API + path, params=params, timeout=TIMEOUT)
            if r.status_code == 200:
                return r.content, r.json()
        except (requests.RequestException, ValueError) as e:  # timeout, reset, bad JSON
            if retry:
                time.sleep(2 ** attempt * 3)
                continue
            raise FetchFailed(repr(e)[:120])

        if r.status_code == 404:
            raise NotFound("404")
        detail = r.content[:200]
        # A rejected key answers 429 with this body. Retrying will not help.
        if b"Invalid app_key" in detail:
            raise Fatal("TfL rejected TFL_APP_KEY. Check the key.")
        if r.status_code == 403 and b"1010" in detail:
            raise Fatal("Cloudflare blocked the User-Agent (error 1010). "
                        "Change UA in src/download/api.py.")
        if r.status_code in (429, 500, 502, 503, 504) and retry:
            time.sleep(2 ** attempt * 3)
            continue
        raise FetchFailed("HTTP %d %s" % (r.status_code, detail[:80].decode("utf8", "replace")))


def timetable(line, stop, direction):
    """GET the timetable of line from stop. Return (raw body, parsed JSON)."""
    return fetch("/Line/%s/Timetable/%s" % (q(line), q(stop)), direction=direction)


def q(segment):
    return urllib.parse.quote(segment, safe="")


# ---- write ------------------------------------------------------------------
def save_bytes(path, body):
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(body)
    os.replace(tmp, path)


def save_json(path, data):
    save_bytes(path, json.dumps(data).encode("utf8"))


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)
