'use strict';

const processors = {
    decks: require('./processors/decks'),
    users: require('./processors/users'),
    slides: require('./processors/slides'),
    usergroups: require('./processors/usergroups'),

    // include this for collections without references elsewhere
    tags: require('./processors/no-dependents'),
};

module.exports = {
    get: function(collectionName) {
        return processors[collectionName];
    },
};
