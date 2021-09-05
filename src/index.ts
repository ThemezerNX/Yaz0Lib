/*
 This is a js library to handle Yaz0/Yaz1 compression and decompression.
 Ported from Python's libyaz0, by MasterVermilli0n / AboodXD
 */

import * as fs from "fs";

/**
 * Check if a buffer is a compressed with Yaz.
 *
 * @param data The buffer to check
 * @returns {boolean} True if the buffer is a compressed Yaz0 file
 */
export function isYazCompressed(data: Buffer): boolean {
    const magic = data.slice(0, 4).toString();
    return magic == "Yaz0" || magic == "Yaz1";
}

function decompressBuffer(src: Buffer): Buffer {
    const srcEnd = src.length;

    const destEnd = src.readUInt32BE(4);
    const dest = Buffer.alloc(destEnd);

    let code = src[16];

    let srcPos = 17;
    let destPos = 0;

    while (srcPos < srcEnd && destPos < destEnd) {
        let found = false;
        for (let i = 0; i < 8; i++) {
            if (srcPos >= srcEnd || destPos >= destEnd) {
                found = true;
                break;
            }

            if (code & 0x80) {
                dest[destPos] = src[srcPos];
                destPos += 1;
                srcPos += 1;
            } else {
                let b1 = src[srcPos];
                srcPos += 1;
                let b2 = src[srcPos];
                srcPos += 1;

                let copySrc = destPos - ((b1 & 0x0f) << 8 | b2) - 1;

                let n = b1 >> 4;
                if (!n) {
                    n = src[srcPos] + 0x12;
                    srcPos += 1;
                } else {
                    n += 2;
                }

                for (let _ = 0; _ < n; _++) {
                    dest[destPos] = dest[copySrc];
                    destPos += 1;
                    copySrc += 1;
                }
            }

            code <<= 1;
        }

        if (!found) {
            if (srcPos >= srcEnd || destPos >= destEnd) {
                break;
            }
            code = src[srcPos];
            srcPos += 1;
        }
    }

    return dest;
}

function compressionSearch(src: Buffer, pos: number, maxLen: number, searchRange: number, srcEnd: number) {
    let foundLen = 1;
    let found = 0;

    if (!searchRange) {
        return {found, foundLen};
    }

    if (pos + 2 < srcEnd) {
        let search = pos - searchRange;
        if (search < 0) {
            search = 0;
        }

        let cmpEnd = pos + maxLen;
        if (cmpEnd > srcEnd) {
            cmpEnd = srcEnd;
        }

        const c1 = src[pos];
        while (search < pos) {
            let lastSearchRange = search;
            search = src.subarray(search, pos).indexOf(c1);
            if (search == -1) {
                break;
            }
            search += lastSearchRange;

            let cmp1 = search + 1;
            let cmp2 = pos + 1;

            while (cmp2 < cmpEnd && src[cmp1] == src[cmp2]) {
                cmp1++;
                cmp2++;
            }

            const len = cmp2 - pos;

            if (foundLen < len) {
                foundLen = len;
                found = search;
                if (foundLen == maxLen) {
                    break;
                }
            }

            search++;
        }
    }

    return {found, foundLen};
}

function compressBuffer(src: Buffer, level: number): Buffer {
    let searchRange;
    if (!level) {
        searchRange = 0;
    } else if (level < 9) {
        searchRange = 0x10e0 * level / 9 - 0x0e0;
    } else {
        searchRange = 0x1000;
    }

    let pos = 0;
    let srcEnd = src.length;

    let dest = new Array<number>();
    let codeBytePos = 0;

    let maxLen = 0x111;

    while (pos < srcEnd) {
        codeBytePos = dest.length;
        dest.push(0);

        for (let i = 0; i < 8; i++) {
            if (pos >= srcEnd) {
                break;
            }

            const {found, foundLen} = compressionSearch(src, pos, maxLen, searchRange, srcEnd);

            if (foundLen > 2) {
                const delta = pos - found - 1;

                if (foundLen < 0x12) {
                    dest.push(delta >> 8 | (foundLen - 2) << 4);
                    dest.push(delta & 0xFF);
                } else {
                    dest.push(delta >> 8);
                    dest.push(delta & 0xFF);
                    dest.push((foundLen - 0x12) & 0xFF);
                }

                pos += foundLen;
            } else {
                dest[codeBytePos] |= 1 << (7 - i);
                dest.push(src[pos]);
                pos++;
            }
        }
    }

    return Buffer.from(dest);
}

/**
 * Compress a buffer with Yaz0.
 *
 * @param data The buffer to compress
 * @param alignment=0 The alignment
 * @param level=0 The compression level
 * @returns {buffer} The compressed buffer
 **/
export function compressYaz0(data: Buffer, alignment = 0, level = 0): Buffer {
    const compressedData = compressBuffer(data, level);

    const result = Buffer.alloc(4 + 4 + 4 + 4 + compressedData.length);
    result.write("Yaz0", 0, 4);
    result.writeUInt32BE(data.length, 4);
    result.writeUInt32BE(alignment, 8);
    result.writeUInt32BE(0, 12);
    compressedData.copy(result, 16);

    return result;
}

/**
 * Decompress a Yaz0 buffer.
 *
 * @throws error Will throw an error if the data is not compressed with Yaz0
 * @param data The compressed buffer
 * @returns {buffer} The decompressed buffer
 */
export function decompressYaz0(data: Buffer): Buffer {
    if (!isYazCompressed(data)) {
        throw new Error("Not Yaz0 compressed!");
    }

    return decompressBuffer(data);
}

/**
 * Read a file from a path and compress it with Yaz0.
 *
 * @param path The filepath
 * @returns {string} The output path. Filename: filename + '.compressed' + original file extension
 */
export function compressYaz0File(path: string): string {
    const data = fs.readFileSync(path);
    const compressed = compressYaz0(data);
    const output = path.replace(/\.[^/.]+$/, "") + ".compressed" + path.substr(path.lastIndexOf("."));
    fs.writeFileSync(output, compressed);

    return output;
}

/**
 * Read a file from a path and decompress it with Yaz0.
 *
 * @param path The filepath
 * @returns {string} The output path. Filename: filename + '.decompressed' + original file extension
 */
export function decompressYaz0File(path: string): string {
    const data = fs.readFileSync(path);
    const decompressed = decompressYaz0(data);
    const output = path.replace(/\.[^/.]+$/, "") + ".decompressed" + path.substr(path.lastIndexOf("."));
    fs.writeFileSync(output, decompressed);

    return output;
}