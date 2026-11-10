'use strict';
const fs=require('node:fs'),path=require('node:path');
module.exports=fs.readFileSync(path.join(__dirname,'m360-csv-import-client.browser.js'),'utf8');
