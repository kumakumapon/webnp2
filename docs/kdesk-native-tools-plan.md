# Native tools and responsive DOS windows

> Status: archived development/acceptance record. Preserved scope and baseline
> references are historical; use [the documentation index](https://github.com/kumakumapon/webnp2/blob/master/docs/README.md)
> for current supported behavior and the repository issues for active work.

Integrate the matching MS-DOS change: replace desktop utility COM entries with
MZ EXEs, preserve the source DOS image/kernel/COMMAND, and synchronize the source
commit used by CI. Validate startup and tool launch/return in standard and
800x600 RGB565 modes, file operations and shell responsiveness in real WebNP2.

Full-screen desktop tools retain exclusive DOS execution while K386 text apps
remain isolated background sessions. Tests must distinguish those execution
models, preserve session state across handoff, and measure shell latency and
screen damage without increasing emulator CPU speed.
