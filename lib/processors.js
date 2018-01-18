'use strict';

const processors = {
    decks: require('./processors/decks'),
    users: require('./processors/users'),
    slides: require('./processors/slides'),
};

module.exports = {
    get: function(collectionName) {
        return processors[collectionName];
    },
};
