# K386 DOS window continuation (in development)

This branch fixes question marks in a fresh guest DOS window and integrates the
next guest-side command shell and DOS execution services from MS-DOS.

The implementation belongs to KDESK/K386 inside the PC-98 guest. The browser
continues to expose ordinary emulated hardware and input. A fixed native source
commit will generate normal and experimental disks. Playwright will inspect
initial screen contents, concurrent guest command prompts, COM/MZ execution,
parent/child CPU and memory restoration, read-only files and disk integrity.

General DOS/BIOS compatibility remains subject to actual validation. Keep the
PRs in draft while the original full-DOS acceptance conditions are incomplete.
