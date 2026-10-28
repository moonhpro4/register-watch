const fs = require("fs");
module.exports = ({ config }) => ({ ...config, android: { ...config.android, googleServicesFile: fs.existsSync("./google-services.json") ? "./google-services.json" : undefined } });
