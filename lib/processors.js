'use strict';

const processors = {
    decks: require('./processors/decks'),
    users: require('./processors/users'),
    slides: require('./processors/slides'),
    usergroups: require('./processors/usergroups'),
};

module.exports = {
    get: function(collectionName) {
        return processors[collectionName];
    },
};
