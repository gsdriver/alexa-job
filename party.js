//
// Utility functions
//

'use strict';

const fs = require('fs');
const contentDir = 'content/blackjackparty';
const csvFile = 'party-data.csv';

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
            results.push(JSON.parse(content));
            if (--fileCount === 0) {
              callback(null, results);
            }
          }
        });
      });
    }
  });
}

// Delete the csv file if it exists
if (fs.existsSync(csvFile)) {
  fs.unlinkSync(csvFile);
}

// Read files and write to a CSV file
readFiles(contentDir, (err, results) => {
  if (err) {
    console.log(err);
  } else {
    // Now go through each result and write to a CSV file
    let text = 'User,players,hands,named,buttons\n';

    results.forEach((result) => {
      let user = result.userId;
      if (user.length > 18) {
        user = user.substring(18, 25);
      }
      text += (user + ',' + result.tableSize + ',' + result.hands + ',' + result.named + ',' + result.buttons + '\n');
    });

    fs.writeFile(csvFile, text, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }
});
