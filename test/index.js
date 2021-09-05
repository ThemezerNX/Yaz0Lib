const path = require("path");
const {decompressYaz0File, compressYaz0File} = require("../dist");

const outDecompressedPath = decompressYaz0File(path.resolve(__dirname, "compressed_origin.szs"));
compressYaz0File(outDecompressedPath);

console.log("Done!");

