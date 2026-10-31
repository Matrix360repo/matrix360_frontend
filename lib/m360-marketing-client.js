'use strict';
const fs = require('fs');
const path = require('path');

const browserJs = fs.readFileSync(path.join(__dirname, 'm360-marketing-client.browser.js'), 'utf-8');

module.exports = browserJs;
