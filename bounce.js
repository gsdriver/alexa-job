'use strict';

const AWS = require('aws-sdk');
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

module.exports = {
  // Generates the text for blackjack e-mail summary
  getBounceResults: function(skill, callback) {
    let text;

    getLastStates(skill, (err, results) => {
      let total = 0;
      let result;
      for (result in results) {
        if (result) {
          total = total + results[result];
        }
      }
      if (total) {
        text = 'Session bounce data for ' + skill + ':\n';
        for (result in results) {
          if (result) {
            text += ('  ' + result + ': ' +
                Math.round((1000 * results[result]) / total) / 10 +
                '% (' + results[result] + ')\n');
          }
        }
      } else {
        text = 'No sessions recorded for ' + skill;
      }
      callback(text);
    });
  },
};

function getLastStates(skill, callback) {
  const states = {};

  AWS.config.update({region: 'us-east-1'});
  readS3Files('garrett-alexa-logs', 'sessions/' + skill + '/', null, (err, results) => {
    if (err) {
      callback(err);
    } else {
      results.forEach((result) => {
        // Read state
        if (result.state) {
          states[result.state] = (states[result.state] + 1) || 1;
        }
      });

      callback(null, states);
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

/*
if (process.argv.length === 3) {
  module.exports.getBounceResults(process.argv[2], (text) => {
    console.log(text);
  });
} else {
  console.log('You need to specify a skill name');
}
*/
