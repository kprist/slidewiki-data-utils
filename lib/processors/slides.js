'use strict';

const { getIdentifierTransform } = require('../identifiers');

// each method is named after a collection, and each receives a document of said collection
// the output is a mongo update command object (like { $set : {} } etc)
// the idTransform is a mapping function that turns old ids to new ids
const updateReferencesIn = {
    decks: function(deck, idTransform) {
        let setOps = {};

        deck.revisions.forEach((rev, revIndex) => {
            rev.contentItems.forEach((item, index) => {
                if (item.kind !== 'slide') return;
                setOps[`revisions.${revIndex}.contentItems.${index}.ref.id`] = idTransform(item.ref.id);
            });
        });

        return setOps;
    },

    deckchanges: function(deckchange, idTransform) {
        let setOps = {};

        if (deckchange.value && deckchange.value.kind === 'slide') {
            setOps['value.ref.id'] = idTransform(deckchange.value.ref.id);
        }

        if (deckchange.oldValue && deckchange.oldValue.kind === 'slide') {
            setOps['oldValue.ref.id'] = idTransform(deckchange.oldValue.ref.id);
        }

        return setOps;
    },

    discussions: function(comment, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        if (comment.content_kind === 'slide') {
            setOps.content_id = identifierTransform(comment.content_id);
        }

        return setOps;
    },

    activities: function(activity, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        if (activity.content_kind === 'slide') {
            if (activity.content_id) {
                // update content_id which is a string (with revision!)
                setOps.content_id = identifierTransform(activity.content_id);
            }
        }

        if (activity.delete_info && activity.delete_info.content_kind === 'slide') {
            if (activity.delete_info.content_id) {
                setOps['delete_info.content_id'] = identifierTransform(activity.delete_info.content_id);
            }
        }

        return setOps;
    },
};

const dependentFilters = {
    decks: { 'revisions.contentItems.kind': 'slide' },

    deckchanges: { $or: [
        { 'value.kind': 'slide' },
        { 'oldValue.kind': 'slide' },
    ]},

    discussions: { 'content_kind': 'slide' },

    activities: { $or: [
        { 'content_id': { $exists: true }, 'content_kind': 'slide' },
        { 'delete_info.content_id': { $exists: true }, 'delete_info.content_kind': 'slide' },
    ]},
};

module.exports = {
    // list with other collections where deck ids are used
    dependents: Object.keys(updateReferencesIn),

    filterFor: function(col) {
        return dependentFilters[col] || {};
    },

    updateReferencesIn: function(col, doc, idTransform){
        return updateReferencesIn[col](doc, idTransform);
    },

};
