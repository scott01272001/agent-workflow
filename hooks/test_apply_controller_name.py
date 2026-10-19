#!/usr/bin/env python3
"""Tests for apply_controller_name.py: queue lookup, one-shot take, output shape."""

import importlib.util
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "apply_controller_name", os.path.join(HERE, "apply_controller_name.py"))
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)


def queue(root, session_id, name):
    d = os.path.join(root, hook.PENDING)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, session_id)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(name)
    return path


def run_main(stdin_payload):
    out = io.StringIO()
    with mock.patch.object(hook.sys, "stdin", io.StringIO(stdin_payload)):
        with redirect_stdout(out):
            hook.main()
    return out.getvalue()


class TakePending(unittest.TestCase):
    def test_reads_then_deletes(self):
        with tempfile.TemporaryDirectory() as root:
            path = queue(root, "sid-1", "VAID-123-controller")
            self.assertEqual(hook.take_pending(root, "sid-1"), "VAID-123-controller")
            self.assertFalse(os.path.exists(path))

    def test_missing_queue_is_none(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertIsNone(hook.take_pending(root, "sid-1"))

    def test_bad_name_is_dropped(self):
        with tempfile.TemporaryDirectory() as root:
            queue(root, "sid-1", "bad name!")
            self.assertIsNone(hook.take_pending(root, "sid-1"))

    def test_found_from_subdirectory(self):
        with tempfile.TemporaryDirectory() as root:
            queue(root, "sid-1", "VAID-123-controller")
            sub = os.path.join(root, "a", "b")
            os.makedirs(sub)
            self.assertEqual(hook.take_pending(sub, "sid-1"), "VAID-123-controller")


class Main(unittest.TestCase):
    def test_outputs_session_title(self):
        with tempfile.TemporaryDirectory() as root:
            queue(root, "sid-1", "VAID-123-controller")
            out = run_main(json.dumps({"session_id": "sid-1", "cwd": root}))
            payload = json.loads(out)
            self.assertEqual(payload["hookSpecificOutput"], {
                "hookEventName": "UserPromptSubmit",
                "sessionTitle": "VAID-123-controller"})

    def test_silent_without_queue(self):
        with tempfile.TemporaryDirectory() as root:
            out = run_main(json.dumps({"session_id": "sid-1", "cwd": root}))
            self.assertEqual(out, "")

    def test_silent_on_bad_session_id(self):
        with tempfile.TemporaryDirectory() as root:
            queue(root, "sid-1", "VAID-123-controller")
            out = run_main(json.dumps({"session_id": "../../etc", "cwd": root}))
            self.assertEqual(out, "")

    def test_silent_on_garbage_stdin(self):
        self.assertEqual(run_main("not json"), "")


if __name__ == "__main__":
    unittest.main()
