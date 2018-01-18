'use strict';

const processors = {
    decks: require('./processors/decks'),
    users: require('./processors/users'),
};

module.exports = {
    get: function(collectionName) {
        return processors[collectionName];
    },
};
