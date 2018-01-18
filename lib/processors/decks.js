'use strict';

const { getIdentifierTransform } = require('../identifiers');

// each method is named after a collection, and each receives a document of said collection
// the output is a mongo update command object (like { $set : {} } etc)
// the idTransform is a mapping function that turns old deck ids to new deck ids
const updateReferencesIn = {
    decks: function(deck, idTransform) {
        let setOps = {};

        if (deck.origin) {
            setOps['origin.id'] = idTransform(deck.origin.id);
        }

        deck.revisions.forEach((rev, revIndex) => {
            rev.contentItems.forEach((item, index) => {
                if (item.kind !== 'deck') return;
                setOps[`revisions.${revIndex}.contentItems.${index}.ref.id`] = idTransform(item.ref.id);
            });

            rev.usage.forEach((usageItem, index) => {
                setOps[`revisions.${revIndex}.usage.${index}.id`] = idTransform(usageItem.id);
            });
        });

        return setOps;
    },

    slides: function(slide, idTransform) {
        let setOps = {};

        slide.revisions.forEach((rev, revIndex) => {
            rev.usage.forEach((usageItem, index) => {
                setOps[`revisions.${revIndex}.usage.${index}.id`] = idTransform(usageItem.id);
            });
        });

        return setOps;
    },

    deckchanges: function(deckchange, idTransform) {
        let setOps = {};

        if (deckchange.path) {
            deckchange.path.forEach((el, index) => {
                if (el.id) {
                    setOps[`path.${index}.id`] = idTransform(el.id);
                }
            });
        }

        if (deckchange.from) {
            deckchange.from.forEach((el, index) => {
                if (el.id) {
                    setOps[`from.${index}.id`] = idTransform(el.id);
                }
            });
        }

        if (deckchange.value && deckchange.value.kind === 'deck') {
            setOps['value.ref.id'] = idTransform(deckchange.value.ref.id);

            if (deckchange.value.origin) {
                setOps['value.origin.id'] = idTransform(deckchange.value.origin.id);
            }
        }

        if (deckchange.oldValue && deckchange.oldValue.kind === 'deck') {
            setOps['oldValue.ref.id'] = idTransform(deckchange.oldValue.ref.id);
        }

        return setOps;
    },

    discussions: function(comment, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        if (comment.content_kind === 'deck') {
            setOps.content_id = identifierTransform(comment.content_id);
        }

        return setOps;
    },

    activities: function(activity, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        if (activity.content_kind === 'deck') {
            if (activity.content_id) {
                // update content_id which is a string (with revision!)
                setOps.content_id = identifierTransform(activity.content_id);
            }
        }

        if (activity.use_info) {
            if (activity.use_info.target_id) {
                setOps['use_info.target_id'] = identifierTransform(activity.use_info.target_id);
            }
        }

        if (activity.fork_info) {
            if (activity.fork_info.content_id) {
                setOps['fork_info.content_id'] = identifierTransform(activity.fork_info.content_id);
            }
        }

        if (activity.delete_info && activity.delete_info.content_kind === 'deck') {
            if (activity.delete_info.content_id) {
                setOps['delete_info.content_id'] = identifierTransform(activity.delete_info.content_id);
            }
        }

        if (activity.move_info) {
            if (activity.move_info.target_id) {
                setOps['move_info.target_id'] = identifierTransform(activity.move_info.target_id);
            }
            if (activity.move_info.source_id) {
                setOps['move_info.source_id'] = identifierTransform(activity.move_info.source_id);
            }
        }

        return setOps;
    },
};

const dependentFilters = {
    decks: { $or: [
        { 'revisions.contentItems.kind': 'deck' },
        { 'revisions.usage.id': { $exists: true } },
        { 'origin.id': { $exists: true } },
    ] },

    slides: { 'revisions.usage.id': { $exists: true } },

    deckchanges: {},

    discussions: { 'content_kind': 'deck' },

    activities: { $or: [
        { 'content_id': { $exists: true }, 'content_kind': 'deck' },
        { 'use_info.target_id': { $exists: true } },
        { 'fork_info.content_id': { $exists: true } },
        { 'delete_info.content_id': { $exists: true }, 'delete_info.content_kind': 'deck' },
        { 'move_info': { $exists: true } },
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
