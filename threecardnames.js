'use strict';

const suggestion = require('./suggestion');
const cardRanks = require('./cardRanks');
const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1',
});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

if ((process.argv.length === 2) || (process.argv[2] === 'list')) {
  listNames(() => {
    console.log('done');
  });
} else if ((process.argv.length === 5) && (process.argv[2] === 'change')) {
  changeNames(process.argv[3], process.argv[4], () => {
    console.log('done');
  });
} else if (process.argv[2] === 'analyze') {
  analyzeHands(() => {
    console.log('done');
  });
}

function listNames(callback) {
  processDBEntries('ThreeCardHands',
    (err, results) => {
    if (err) {
      console.log('Error processing data: ' + err);
    } else {
      const names = {};
      const timedNames = {};

      results.forEach((result) => {
        result.hands.forEach((hand) => {
          names[hand.name] = (names[hand.name] + 1) || 1;
          if (hand.timestamp) {
            timedNames[hand.name] = (timedNames[hand.name] + 1) || 1;
          }
        });
      });

      console.log('WITH TIMESTAMPS:');
      console.log(timedNames);
      console.log('\nALL:');
      console.log(names);
    }
    callback();
  });
}

function analyzeHands(callback) {
  processDBEntries('ThreeCardHands',
    (err, results) => {
    if (err) {
      console.log('Error processing data: ' + err);
    } else {
      const strong = [];
      const moderate = [];
      const weak = [];
      let correct = 0;
      let incorrect = 0;

      results.forEach((result) => {
        result.hands.forEach((hand) => {
          // What should they have done?
          const newCards = JSON.parse(JSON.stringify(hand.cards.slice(0, 3)));
          newCards.sort();
          const newHold = suggestion[newCards[0] + '-' + newCards[1] + '-' + newCards[2]];

          // Now we have to "unsort"
          const hold = [];
          newHold.forEach((value) => {
            hold.push(hand.cards.indexOf(newCards[value]));
          });
          hold.sort();

          if (JSON.stringify(hold) === JSON.stringify(hand.hold)) {
            correct++;
          } else {
            incorrect++;
          }

          // And regardless, is this a strong hand?
          const cards = [];
          let i;
          for (i = 0; i < 3; i++) {
            if (hand.hold.indexOf(i) > -1) {
              cards.push(hand.cards[i]);
            }
          }

          // Then complete the hand up to 3 cards
          const end = 6 - cards.length;
          for (i = 3; i < end; i++) {
            cards.push(hand.cards[i]);
          }
          cards.sort();
          const rank = cardRanks[cards[0] + '-' + cards[1] + '-' + cards[2]];
          if (rank < 400) {
            strong.push(hand);
          } else if (rank < 531) {
            moderate.push(hand);
          } else {
            weak.push(hand);
          }
        });
      });

      console.log(correct + ' correctly played hands and ' + incorrect + ' improperly played hands.');
      console.log(strong.length + ' hands are strong, ' + moderate.length + ' hands are moderate, and ' + weak.length + ' hands are weak.');
/*
      // OK, now let's load balance into groups of 50 - with more strong hands up front
      const groupCount = Math.floor((strong.length + moderate.length + weak.length) / 50);
      let i;
      const processed = [];
      for (i = 0; i < groupCount; i++) {
        let j;

        // Put in 25 strong, 15 moderate, 10 weak (to the extent we have some left)
        const numStrong = Math.min(25, strong.length);
        const numModerate = Math.min(15, moderate.length);
        const numWeak = 50 - numStrong - numModerate;

        if (numWeak < 50) {
          const newHands = [];
          for (j = 0; j < numStrong; j++) {
            newHands.push(strong.pop());
          }
          for (j = 0; j < numModerate; j++) {
            newHands.push(moderate.pop());
          }
          for (j = 0; j < numWeak; j++) {
            newHands.push(weak.pop());
          }
          processed.push(newHands);
        }
      }

      let numChanges = processed.length;
      for (i = 0; i < processed.length; i++) {
        const Item = {token: 'b' + i, hands: processed[i]};
        doc.put({TableName: 'ThreeCardHands', Item: Item}, (err, data) => {
          if (err) {
            console.log('Error');
          }
          if (--numChanges === 0) {
            callback();
          }
        });
      }
*/
    }
    callback();
  });
}

function changeNames(oldName, newName, callback) {
  processDBEntries('ThreeCardHands',
    (err, results) => {
    if (err) {
      console.log('Error processing data: ' + err);
      callback();
    } else {
      let change;
      let i;
      let numChanges = 0;

      results.forEach((result) => {
        change = false;
        for (i = 0; i < result.hands.length; i++) {
          if (result.hands[i].name === oldName) {
            result.hands[i].name = newName;
            change = true;
          }
        }

        if (change) {
          // Write out a new DB entry
          numChanges++;
          const Item = {token: result.token, hands: result.hands};
          doc.put({TableName: 'ThreeCardHands', Item: Item}, (err, data) => {
            if (err) {
              console.log('Error');
            }
            if (--numChanges === 0) {
              done();
            }
          });
        }
      });

      function done() {
        callback();
      }
    }
  });
}

function processDBEntries(dbName, complete) {
  const results = [];

  // Loop thru to read in all items from the DB
  (function loop(firstRun, startKey) {
   const params = {TableName: dbName};

   if (firstRun || startKey) {
     params.ExclusiveStartKey = startKey;

     const scanPromise = doc.scan(params).promise();
     return scanPromise.then((data) => {
       let i;

       for (i = 0; i < data.Items.length; i++) {
         const entry = data.Items[i];
         results.push(entry);
       }

       if (data.LastEvaluatedKey) {
         return loop(false, data.LastEvaluatedKey);
       }
     });
   }
  })(true, null).then(() => {
    complete(null, results);
  }).catch((err) => {
    console.log(err.stack);
    complete(err);
  });
}
