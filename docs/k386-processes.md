# K386 process compatibility continuation

Development follows the merged guest shell implementation. The next native
revision investigates real COMMAND.COM execution, private process memory and
PSP/environment, nested EXEC/read-only file inheritance and virtual interrupt
delivery. CPU/driver behavior must be established in the shipped wasm before
claiming compatibility. The browser continues to provide emulated hardware,
input and inspection; application execution remains in the PC-98 guest.

This branch will pin the tested native revision, generate the ordinary and
experimental images and extend actual-browser validation for process memory,
background execution, exceptions, file state and disk safety. Existing desktop
and normal-profile tests remain required. Keep remaining compatibility limits
explicit and preserve draft status until full DOS acceptance is achieved.
