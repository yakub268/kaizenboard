"""
sync-claude-projects.py
Run after any Claude Code session to sync MEMORY.md → KaizenBoard.

Usage:
    python sync-claude-projects.py          # sync silently
    python sync-claude-projects.py --verbose
"""
import sys
import json
import urllib.request
import urllib.error

KAIZENBOARD_URL = "http://localhost:8000/api/claude/sync"


def sync(verbose: bool = False) -> bool:
    try:
        req = urllib.request.Request(
            KAIZENBOARD_URL,
            method="POST",
            headers={"Content-Type": "application/json"},
            data=b"{}",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            if verbose:
                print(f"[KaizenBoard] Sync complete: {result}")
            return True
    except urllib.error.URLError:
        # KaizenBoard not running — silent fail, not critical
        if verbose:
            print("[KaizenBoard] Not running — skipping sync (start with: cd ~/kaizenboard && docker-compose up -d)")
        return False
    except Exception as e:
        if verbose:
            print(f"[KaizenBoard] Sync error: {e}")
        return False


if __name__ == "__main__":
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    sync(verbose=verbose)
