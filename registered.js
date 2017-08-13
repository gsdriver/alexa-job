//
// List all registered users
//

'use strict';

const FB = require('facebook-node');
const roulette = require('./roulette');
const blackjack = require('./blackjack');

let numCalls = 2;
const allUsers = {};

blackjack.getFacebookIDs((users) => {
  // Add each user to the list
  users.forEach((user) => {
    if (!allUsers[user.id]) {
      allUsers[user.id] = {};
    }
    allUsers[user.id].blackjack = true;
    allUsers[user.id].name = user.name;
    allUsers[user.id].email = user.email;
  });

  if (--numCalls === 0) {
    completed();
  }
});

roulette.getFacebookIDs((users) => {
  // Add each user to the list
  users.forEach((user) => {
    if (!allUsers[user.id]) {
      allUsers[user.id] = {};
    }
    allUsers[user.id].roulette = true;
    allUsers[user.id].name = user.name;
    allUsers[user.id].email = user.email;
  });

  if (--numCalls === 0) {
    completed();
  }
});

function completed() {
  // OK, now for each user get the full name and email
  console.log(JSON.stringify(allUsers));
}
