const fs = require("fs");
const path = require("path");

const files = fs.readdirSync(`./${process.argv[2]}`);
let outputText = "";

files.forEach((file) => {
    outputText += path.join(process.cwd(), process.argv[2], file) + " " + file.replace(".png", "") + "\n"
})

fs.writeFileSync(`${process.argv[2]}.txt`, outputText)