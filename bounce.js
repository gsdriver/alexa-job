'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

if (process.argv.length === 3) {
  getBounceResults(process.argv[2], (text) => {
    writeResults(process.argv[2], text);
  });
} else {
  const skills = ['blackjack', 'roulette', 'craps', 'videopoker', 'slots'];
  let i;
  let numCalls = skills.length;
  const results = {};

  for (i = 0; i < skills.length; i++) {
    getBounceResults(skills[i], function(text) {
      results[this.skill] = text;
      if (--numCalls === 0) {
        completed();
      }
    }.bind({skill: skills[i]}));
  }

  function completed() {
    for (i = 0; i < skills.length; i++) {
      writeResults(skills[i], results[skills[i]]);
    }
  }
}

function writeResults(skill, text) {
  const csvFile = 'bounce-' + skill + '.csv';

  // Delete the csv file if it exists
  if (fs.existsSync(csvFile)) {
    fs.unlinkSync(csvFile);
  }

  fs.writeFile(csvFile, text, (err) => {
    if (err) {
      console.log(err);
    }
  });
}

// Generates the text for blackjack e-mail summary
function getBounceResults(skill, callback) {
  let text;

  getLastStates(skill, (err, results, states) => {
    let result;

    if (states) {
      // First line, all the states
      let i;
      text = 'Date,';
      for (i = 0; i < states.length; i++) {
        text += states[i] + '%,';
      }
      text += ',';
      for (i = 0; i < states.length; i++) {
        text += states[i] + ',';
      }
      text += '\n';
      for (result in results) {
        if (result) {
          let state;
          let total = 0;

          // OK, let's write the results for this date
          text += getFormattedDate(new Date(parseInt(result))) + ',';
          for (state in results[result]) {
            if (state) {
              total += results[result][state];
            }
          }

          if (total) {
            states.forEach((state) => {
              if (results[result][state]) {
                text += Math.round((1000 * results[result][state]) / total) / 10;
              }
              text += ',';
            });
          }

          text += ',';
          states.forEach((state) => {
            if (results[result][state]) {
              text += results[result][state];
            }
            text += ',';
          });
          text += '\n';
        }
      }
    }
    callback(text);
  });
}

function getLastStates(skill, callback) {
  const states = [];
  const results = {};

  AWS.config.update({region: 'us-east-1'});
  readS3Files('garrett-alexa-logs', 'sessions/' + skill + '/', null, (err, data) => {
    if (err) {
      callback(err);
    } else {
      data.forEach((result) => {
        // Read state
        if (result.state) {
          // Strip the date from the timestamp
          const fulldate = new Date(result.timestamp);
          const date = (new Date(fulldate.getFullYear(),
                fulldate.getMonth(), fulldate.getDate())).valueOf();
          if (!results[date]) {
            results[date] = {};
          }
          results[date][result.state] = (results[date][result.state] + 1) || 1;

          if (states.indexOf(result.state) === -1) {
            states.push(result.state);
          }
        }
      });

      callback(null, results, states);
    }
  });
}

// Read every file from an S3 bucket
function readS3Files(bucket, prefix, daterange, callback) {
  const results = [];
  let keysToProcess;

  // First get a full directory listing
  getKeyList(bucket, prefix, (err, keyList) => {
    if (err) {
      callback(err);
    } else if (keyList.length === 0) {
      callback('no results');
    } else {
      keysToProcess = keyList.length;
      (function processFiles(keyList) {
        if (keyList.length === 0) {
          // All done!
          return;
        }

        const key = keyList.pop();
        const timestamp = parseInt(key.replace(prefix, '').replace('.txt', ''));
        if (!daterange ||
            (!((daterange.start && (timestamp <= daterange.start)) ||
              (daterange.end && (timestamp >= daterange.end))))) {
          // In the date range, so download from S3
          s3.getObject({Bucket: bucket, Key: key},
            function(err, data) {
              if (err) {
                // Oops, just abort the whole thing
                callback(err);
              } else {
                // OK, let's read this in and split into an array
                try {
                  const text = data.Body.toString('ascii');
                  const log = JSON.parse(text);
                  log.timestamp = this.timestamp;
                  results.push(log);
                } catch(e) {
                  console.log(e.name);
                }

                // Is that it?
                if (--keysToProcess === 0) {
                  // Sort by timestamp
                  results.sort((a, b) => b.timestamp - a.timestamp);
                  callback(null, results);
                }
              }
            }.bind({timestamp: timestamp}));
        } else if (--keysToProcess === 0) {
          // We're done
          results.sort((a, b) => b.timestamp - a.timestamp);
          callback(null, results);
        }

        processFiles(keyList);
      })(keyList);
    }
  });
}

function getKeyList(bucket, prefix, callback) {
  const keyList = [];

  // Loop thru to read in all keys
  (function loop(firstRun, token) {
    const params = {Bucket: bucket};
    if (prefix) {
      params.Prefix = prefix;
    }

    if (firstRun || token) {
      params.ContinuationToken = token;

      const listObjectPromise = s3.listObjectsV2(params).promise();
      return listObjectPromise.then((data) => {
        let i;

        for (i = 0; i < data.Contents.length; i++) {
          keyList.push(data.Contents[i].Key);
        }
        if (data.NextContinuationToken) {
          return loop(false, data.NextContinuationToken);
        }
      });
    }
  })(true, null).then(() => {
    // Success - now parse these into stories
    callback(null, keyList);
  }).catch((err) => {
    callback(err);
  });
}

function getFormattedDate(date) {
  const year = date.getFullYear();
  const month = (1 + date.getMonth()).toString();
  const day = date.getDate().toString();

  return month + '/' + day + '/' + year;
}
