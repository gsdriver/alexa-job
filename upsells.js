//
// Utility functions
//

'use strict';

const fs = require('fs');
const dirnames = ['content/slots-upsell', 'content/blackjack-upsell'];
const csvFile = 'upsell-prompts.csv';

// Read every file from the content directory
function readFiles(callback) {
  const results = [];
  let dirCount = dirnames.length;

  dirnames.forEach((dirname) => {
    fs.readdir(dirname, (err, filenames) => {
      if (err) {
        callback(err, null);
      } else {
        let fileCount = filenames.length;

        filenames.forEach((filename) => {
          fs.readFile(dirname + '/' + filename, 'utf-8', function(err, content) {
            const timestamp = parseInt(this.filename.replace('.txt', ''));
            if (err) {
              callback(err, null);
            } else {
              const result = JSON.parse(content);
              result.timestamp = timestamp;
              results.push(result);
              if (--fileCount === 0) {
                if (--dirCount === 0) {
                  callback(null, results);
                }
              }
            }
          }.bind({filename: filename}));
        });
      }
    });
  });
}

function getFormattedDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (1 + date.getMonth()).toString();
  const day = date.getDate().toString();
  const hour = date.getHours().toString();
  let minute = date.getMinutes().toString();
  if (minute.length === 1) {
    minute = '0' + minute;
  }

  return month + '/' + day + '/' + year + ' ' + hour + ':' + minute;
}

// Delete the csv file if it exists
if (fs.existsSync(csvFile)) {
  fs.unlinkSync(csvFile);
}

// Read files and write to a CSV file
readFiles((err, results) => {
  if (err) {
    console.log(err);
  } else {
    // Now go through each result and write to a CSV file
    let text = 'Date,Action,Selection,Response,Product,Action,userId\n';

    results.sort((a, b) => (a.timestamp - b.timestamp));
    results.forEach((result) => {
      text += getFormattedDate(result.timestamp);
      text += ',';
      if (result.action !== undefined) {
        text += result.action;
      }
      text += ',';
      if (result.selection !== undefined) {
        text += result.selection;
      }
      text += ',';
      if (result.response !== undefined) {
        text += result.response;
      }
      text += ',';
      if (result.token !== undefined) {
        const segments = result.token.split('.');
        text += segments[1] + ',' + segments[2];
      } else {
        text += ' , ';
      }
      text += ',';
      if (result.userId !== undefined) {
        text += result.userId;
      }
      text += '\n';
    });

    fs.writeFile(csvFile, text, (err) => {
      if (err) {
        console.log(err);
      }
      console.log('done');
    });
  }
});
