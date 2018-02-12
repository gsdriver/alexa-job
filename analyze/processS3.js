//
// Processes game play from Blackjack to provide per-player score
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

readS3Files('garrett-alexa-analysis', (err, results) => {
  const suggestedPlay = processResults(err, results);
  const params = {Body: JSON.stringify(suggestedPlay),
    Bucket: 'garrett-alexa-analysis',
    Key: 'suggestions.txt'};
  s3.putObject(params, (err, data) => {
    if (err) {
      console.log(err, err.stack);
    }
  });
});

function processResults(err, results) {
  let user;
  const playSummary = {};
  const playToEvaluate = ['split', 'double', 'surrender'];
  const suggestPlay = {};

  for (user in results) {
    if (user) {
      // Look at each hand this user played
      playSummary[user] = {
        split: {correct: 0, missed: 0, overkill: 0},
        double: {correct: 0, missed: 0, overkill: 0},
        surrender: {correct: 0, missed: 0, overkill: 0},
      };

      results[user].hands.forEach((hand) => {
        hand.rounds.forEach((round) => {
          playToEvaluate.forEach((play) => {
            if (round.suggestion === play) {
              if (round.action === play) {
                playSummary[user][play].correct++;
              } else {
                playSummary[user][play].missed++;
              }
            } else if (round.action === play) {
              playSummary[user][play].overkill++;
            }
          });
        });
      });
    }
  }

  playToEvaluate.forEach((play) => {
    for (user in playSummary) {
      // If never played, but missed, print it out
      if ((playSummary[user][play].missed > 1)
        && !playSummary[user][play].correct
        && !playSummary[user][play].overkill) {
        // We should suggest this play to this user
        if (!suggestPlay[user]) {
          suggestPlay[user] = {};
        }
        suggestPlay[user][play] = 1;
      }
    }
  });

  return suggestPlay;
}

// Read every file from an S3 bucket
function readS3Files(bucket, callback) {
  const results = {};
  let keysToProcess;

  // First get a full directory listing
  getKeyList(bucket, (err, keyList) => {
    if (err) {
      callback(err);
    } else {
      keysToProcess = keyList.length;
      keyList.forEach((key) => {
        const keyPath = key.split('/');
        if (keyPath.length === 3) {
          const userId = keyPath[1];

          // In the date range, so download from S3
          s3.getObject({Bucket: bucket, Key: key},
            (err, data) => {
            if (err) {
              // Oops, just abort the whole thing
              callback(err);
            } else {
              // OK, let's read this in and split into an array
              try {
                const text = data.Body.toString('ascii');

                if (!results[userId]) {
                  results[userId] = {hands: []};
                }

                results[userId].hands.push(JSON.parse(text));
              } catch(e) {
                console.log(e.name);
              }

              // Is that it?
              if (--keysToProcess === 0) {
                callback(null, results);
              }
            }
          });
        } else if (--keysToProcess === 0) {
          // We're done
          callback(null, results);
        }
      });
    }
  });
}

function getKeyList(bucket, callback) {
  const keyList = [];

  // Loop thru to read in all keys
  (function loop(firstRun, token) {
    const params = {Bucket: bucket};

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
