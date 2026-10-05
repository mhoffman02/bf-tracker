# Learnings

## 2026-10-04
**Worked well:** Doc/strict pass was behavior-neutral; the jsdom e2e suite (32 tests) confirmed it in ~10s.
**Needs improvement:** Comment-only edits still alter precached files, so the SW VERSION bump is easy to forget.
