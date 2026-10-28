# KDESK/386 window tool migration (in progress)

Text editing and system settings are being integrated into guest-side cooperative
windows. The existing Files window remains the desktop file browser. Standalone
EXEs remain available from real DOS.

The initial text editor has an 8 KiB buffer; standalone EDIT98 retains 16 KiB.
Image viewer/editor and BASIC still use their previous execution paths. Moving
all tools into one KDESK code segment exceeds the 64 KiB limit; a separately
loaded GUI module interface is needed before those ports are complete.

This work stays in draft until the window operations, saved disk contents,
background DOS progress and existing desktop regressions have been verified.
