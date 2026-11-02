# K38632 Ring-3 probe integration plan

Integrate MS-DOS issue #31's first CPU milestone: a standalone guest diagnostic
for actual 32-bit Ring-3 execution, paging, PC-98 IRQ0 versus #DF, contained
faults and safe real-DOS return. Bundle its exact native source revision and
inspect CPU-generated records in Playwright. Re-run the diagnostic, then launch
KDESK and two V86 programs to verify recovery and unchanged FAT12 disk bytes.

Keep the existing emulator and V86 runtime, XARRAY and GUI regression gates.
This is not the complete PM32 application loader or SDK.
