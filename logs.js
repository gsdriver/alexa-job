//
// Processes log files
//

'use strict';

const logger = require('alexa-logger');

if (process.argv.length !== 3) {
  console.log('You need to specify which skill you want to process logs for.');
  return;
}

const options = {
  s3: {
    bucket: 'garrett-alexa-logs',
    keyPrefix: process.argv[2] + '/',
  },
};
const resultFile = 'log-' + process.argv[2] + '.csv';

logger.processLogs(options, resultFile, (err) => {
  if (err) {
    console.log(err);
  } else {
    console.log('File saved!');
  }
});
