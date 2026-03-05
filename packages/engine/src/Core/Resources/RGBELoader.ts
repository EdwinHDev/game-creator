/**
 * Loader for Radiance RGBE (.hdr) files.
 * Based on the Radiance RGBE format specification.
 */
export class RGBELoader {
  /**
   * Parses an HDR file from an ArrayBuffer.
   * @param buffer The binary data of the .hdr file.
   * @returns An object containing width, height, and the decoded Float32Array pixel data.
   */
  public static parse(buffer: ArrayBuffer): { width: number; height: number; data: Float32Array } {
    const uint8Array = new Uint8Array(buffer);
    let offset = 0;

    // 1. Read Header (Look for the resolution line starting with -Y or +Y)
    let headerText = '';
    while (offset < uint8Array.length) {
      const char = String.fromCharCode(uint8Array[offset++]);
      headerText += char;
      if (headerText.endsWith('\n\n')) break;
    }

    let width = 0, height = 0;
    let resolutionLine = '';
    while (offset < uint8Array.length) {
      const char = String.fromCharCode(uint8Array[offset++]);
      resolutionLine += char;
      if (char === '\n') break;
    }

    // Typical resolution line: -Y 512 +X 1024
    const match = resolutionLine.match(/-Y (\d+) \+X (\d+)/);
    if (match) {
      height = parseInt(match[1], 10);
      width = parseInt(match[2], 10);
    } else {
      throw new Error("HDR resolution format not supported.");
    }

    // 2. Read Pixels (Radiance RLE decoding)
    const data = new Float32Array(width * height * 4);
    let scanlineOffset = 0;
    const numScanlines = height;

    for (let y = 0; y < numScanlines; y++) {
      // Modern RLE check (starts with 2, 2)
      if (uint8Array[offset] !== 2 || uint8Array[offset + 1] !== 2) {
        throw new Error("Only modern RLE format is supported.");
      }
      // Note: uint8Array[offset + 2] and [offset + 3] contain the scanline width (high/low bits)
      // but we already have it from the resolution line.
      offset += 4;

      const scanlineData = new Uint8Array(width * 4);
      for (let channel = 0; channel < 4; channel++) {
        let ptr = channel * width;
        const end = ptr + width;
        while (ptr < end) {
          let value = uint8Array[offset++];
          if (value > 128) {
            // Run Length Encoding
            const count = value - 128;
            value = uint8Array[offset++];
            for (let i = 0; i < count; i++) {
              scanlineData[ptr++] = value;
            }
          } else {
            // Uncompressed
            const count = value;
            for (let i = 0; i < count; i++) {
              scanlineData[ptr++] = uint8Array[offset++];
            }
          }
        }
      }

      // Convert RGBE to Linear RGB (Float)
      for (let x = 0; x < width; x++) {
        const r = scanlineData[x];
        const g = scanlineData[x + width];
        const b = scanlineData[x + width * 2];
        const e = scanlineData[x + width * 3];

        const dataIndex = scanlineOffset + x * 4;
        if (e > 0) {
          const f = Math.pow(2.0, e - 128.0) / 256.0;
          data[dataIndex] = r * f;
          data[dataIndex + 1] = g * f;
          data[dataIndex + 2] = b * f;
          data[dataIndex + 3] = 1.0;
        } else {
          data[dataIndex] = 0;
          data[dataIndex + 1] = 0;
          data[dataIndex + 2] = 0;
          data[dataIndex + 3] = 1.0;
        }
      }
      scanlineOffset += width * 4;
    }

    return { width, height, data };
  }
}
