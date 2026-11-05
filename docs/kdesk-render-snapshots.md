# KDESK render snapshot investigation

The master CI PEGC render-load check captured background DOS counter text in
the expected foreground Memo snapshot. The visible pixels matched, and a later
text snapshot contained the fully restored Memo. Native incremental DOS drawing
currently changes and restores text VRAM without marking KDPERF01 busy.

The fix will make the native busy/ready contract cover these mutations and
collect complete, idle foreground snapshots without relaxing exact text,
attribute or pixel comparisons. Both PEGC and Cirrus, background CPU progress,
odd-pixel movement and hide/restore remain required. Invalid or busy producers
must never be treated as a valid snapshot.

Implementation and verification results will be recorded here before review.
