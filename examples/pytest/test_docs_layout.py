# Run the docs-kit layout check as a pytest test. Needs Node on the PATH.
# Point CLI at your copy: vendored (scripts/docs-kit.mjs) or node_modules/docs-kit/scripts/docs-kit.mjs.
import subprocess

CLI = "scripts/docs-kit.mjs"


def test_docs_follow_the_docs_kit_layout():
    r = subprocess.run(["node", CLI, "check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
