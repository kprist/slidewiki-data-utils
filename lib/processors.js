'use strict';

const processors = {
    decks: require('./processors/decks'),
};

module.exports = {
    get: function(collectionName) {
        return processors[collectionName];
    },
};
