# KDESK high-resolution RGB565 display

Target 800x600 with 65,536 simultaneous colors through NP2kai's PC-98 Cirrus/WAB
hardware emulation, with the existing PEGC desktop as fallback. First validate
a guest hardware probe and the WASM screen-transfer path, then integrate native
GUI geometry/input and image generation. No HTML desktop or upscaling substitute.
