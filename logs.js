//
// Processes log files
//

'use strict';

const fs = require('fs');

// Read every file from the content directory
function readFiles(dirname, callback) {
  const results = [];

  fs.readdir(dirname, (err, filenames) => {
    if (err) {
      callback(err, null);
    } else {
      let fileCount = filenames.length;

      filenames.forEach((filename) => {
        fs.readFile(dirname + '/' + filename, 'utf-8', (err, content) => {
          if (err) {
            callback(err, null);
          } else {
            // Do a little processing
            const log = JSON.parse(content);
            log.timestamp = parseInt(filename.split('.')[0]);
            results.push(log);
            if (--fileCount === 0) {
              callback(null, results);
            }
          }
        });
      });
    }
  });
}

if (process.argv.length !== 3) {
  console.log('You need to specify which skill you want to process logs for.');
  return;
}

const logDir = 'content/logs/' + process.argv[2];
const resultFile = logDir + '/summary.csv';

// Delete the output file if it exists
if (fs.existsSync(resultFile)) {
  fs.unlinkSync(resultFile);
}

// Read files and write to a CSV file
readFiles(logDir, (err, results) => {
  if (err) {
    console.log(err);
  } else {
    // OK, now tie together sessions based on session ID
    // we will store intent name, slot, and response
    // This will then create a nice history that we can write
    const processed = [];

    results.forEach((result) => {
      const data = {
        sessionId: result.event.session.sessionId,
        timestamp: result.timestamp,
        intent: (result.event.request.type === 'IntentRequest')
          ? result.event.request.intent.name
          : result.event.request.type,
        response: result.response};

      if (result.event.request.intent && result.event.request.intent.slots) {
        data.slots = result.event.request.intent.slots;
      }

      processed.push(data);
    });

    // Now, match up by session ID
    processed.sort((a, b) => (a.timestamp - b.timestamp));
    const sessions = {};

    processed.forEach((result) => {
      if (!sessions[result.sessionId]) {
        sessions[result.sessionId] = {};
        sessions[result.sessionId].timestamp = result.timestamp;
        sessions[result.sessionId].sessions = [];
      }
      sessions[result.sessionId].sessions.push({intent: result.intent,
                slots: result.slots, response: result.response});
    });

    // Now write out each sessions
    let session;
    let text = '';

    for (session in sessions) {
      if (session) {
        text += (new Date(sessions[session].timestamp)).toString() + '\n';
        sessions[session].sessions.forEach((result) => {
          text += ',"' + result.intent + '","';
          if (result.slots) {
            text += JSON.stringify(result.slots).replace(/"/g, '""');
          }
          text += '","' + result.response.replace(/"/g, '""') + '"\n';
        });
      }
    }

    fs.writeFileSync(resultFile, text);
  }
});
