# KDESK interface integration

Pair with the MS-DOS `codex/kdesk-interface-refresh` branch. Pin the completed
native commit when importing the normal and experimental K386 images.

Add actual browser coverage for native window maximize/restore, the unified
taskbar, mouse DOS launch and retained DOS CPU/memory state. Keep ordinary GUI,
clipboard, file, image, calculator/clock, Japanese input and K386 resource suites.

Run npm test, npm run build and browser checks; publish before/after screenshots
and precise usage in the PR. The UI remains entirely inside the PC-98 guest.
