interface Window {
  np2debug?: { np2: { readMemoryBase64(address: number, length: number): {base64: string} } };
  Module?: { HEAPU8: Uint8Array };
  kguiTerminalXmsBacking?: number;
}
