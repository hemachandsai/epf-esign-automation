const fs = require("fs");
const archiver = require("archiver");

const directoryName = "node_modules";
// node_modules are required as the electron child prcoess cannot access files inside exe bundle
const output = fs.createWriteStream(`${directoryName}.zip`);

const archive = archiver("zip", {
  zlib: {
    level: 9,
  },
});

output.on("close", function () {
  console.log(archive.pointer() + " total bytes");
  console.log("Archiver has been finalized and the output file descriptor has closed.");
});

output.on("end", function () {
  console.log("Data has been drained");
});

archive.on("warning", function (err) {
  if (err.code === "ENOENT") {
    console.log("Error ENOENT");
  } else {
    throw err;
  }
});

archive.on("error", function (err) {
  throw err;
});

console.log(`Started zipping ${directoryName} to ${directoryName}.zip`);

archive.pipe(output);
archive.directory(directoryName, directoryName);
archive.finalize();
