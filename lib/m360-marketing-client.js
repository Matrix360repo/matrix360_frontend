'use strict';
const fs = require('fs');
const path = require('path');

const browserJs = fs.readFileSync(path.join(__dirname, 'm360-marketing-client.browser.js'), 'utf-8');

module.exports = 'window.M360LiveSendingEnabled = ' + (process.env.MARKETING_LIVE_SEND_ENABLED === 'true') + ';\n' + browserJs;
