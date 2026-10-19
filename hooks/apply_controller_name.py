#!/usr/bin/env python3
"""UserPromptSubmit hook: rename this session to the queued controller name.

A session cannot rename itself mid-turn. A UserPromptSubmit hook's `sessionTitle`
does what `/rename` does, so the name lands with the user's next message. The
plugin's mod (register.tsx) queues the name at spawn time under the main
checkout's `.claude/agent-workspace/.controller-names/<session id>`; this hook
applies it once and deletes it. It runs on every prompt of every session, so any
problem exits quietly.

The queue path is shared with register.tsx (CONTROLLER_QUEUE there); keep the two
in sync.
"""

import json
import os
import re
import sys

PENDING = os.path.join(".claude", "agent-workspace", ".controller-names")
SESSION_ID = re.compile(r"[A-Za-z0-9-]+")
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*")
MAX_WALK = 10


def find_queue(cwd, session_id):
    """The queue file for this session: in cwd's workspace, or a parent's (a
    session may start in a subdirectory of the checkout)."""
    d = os.path.abspath(cwd)
    for _ in range(MAX_WALK):
        path = os.path.join(d, PENDING, session_id)
        if os.path.isfile(path):
            return path
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent
    return None


def take_pending(cwd, session_id):
    path = find_queue(cwd, session_id)
    if path is None:
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            name = fh.read().strip()
        os.remove(path)
    except OSError:
        return None
    return name if NAME.fullmatch(name) else None


def main():
    try:
        data = json.load(sys.stdin)
    except (ValueError, AttributeError):
        return
    session_id = data.get("session_id")
    cwd = data.get("cwd") or os.getcwd()
    if not isinstance(session_id, str) or not SESSION_ID.fullmatch(session_id):
        return
    if not isinstance(cwd, str):
        return
    name = take_pending(cwd, session_id)
    if name:
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit", "sessionTitle": name}}))


if __name__ == "__main__":
    main()
