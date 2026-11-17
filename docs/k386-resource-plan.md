# K386 resource control integration plan

> Status: archived development/acceptance record. Preserved scope and baseline
> references are historical; use [the documentation index](https://github.com/kumakumapon/webnp2/blob/master/docs/README.md)
> for current supported behavior and the repository issues for active work.

Integrate the companion MS-DOS resource-control continuation from merged native
base `10b4a307e5ca35e4f2805d5b626c03ac8c07dbf8` and webnp2 base
`e24309ad982ffd38a086ec7d094ba9dc789937f5`.

The guest implements priorities, CPU budgets, resource accounting, lifecycle
events, interruption and task-manager controls. The browser only supplies the
emulator, input and real CPU/memory inspection; it does not schedule DOS tasks.

Pin the final native commit, generate both boot profiles from it, add a
Playwright resource-control suite, preserve the existing suites and document
controls, ABI compatibility, accounting units and current DOS limitations.
Check normal KDESK without the monitor, background progress and disk integrity.
Open draft PRs before implementation and report actual CI/browser results.
