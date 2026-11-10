from pathlib import Path

def test_approved_homepage_fidelity():
    root = Path(__file__).resolve().parents[1]
    current = (root / "index.html").read_text(encoding="utf-8")
    approved = (root / "approved_original/index.html").read_text(encoding="utf-8")
    script = '<script src="matrix360-engagement.js" defer></script>'
    assert current.replace(script + chr(10), '') == approved
