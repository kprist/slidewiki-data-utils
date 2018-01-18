'use strict';

const { getIdentifierTransform } = require('../identifiers');

// each method is named after a collection, and each receives a document of said collection
// the output is a mongo update command object (like { $set : {} } etc)
// the idTransform is a mapping function that turns old ids to new ids
const updateReferencesIn = {

    usergroups: function(usergroup, idTransform) {
        // usergroups hold a copy of `_id` in `id`, let's add it here as well
        let setOps = {};

        if (usergroup.id) {
            setOps.id = idTransform(usergroup.id);
        }

        return setOps;
    },

    decks: function(deck, idTransform) {
        let setOps = {};

        if (deck.editors && deck.editors.groups) {
            deck.editors.groups.forEach((group, index) => {
                setOps[`editors.groups.${index}.id`] = idTransform(group.id);
            });
        }

        return setOps;
    },

    activities: function(activity, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        if (activity.content_kind === 'group') {
            if (activity.content_id) {
                // update content_id which is a string
                setOps.content_id = identifierTransform(activity.content_id);
            }
        }

        if (activity.delete_info && activity.delete_info.content_kind === 'group') {
            if (activity.delete_info.content_id) {
                setOps['delete_info.content_id'] = identifierTransform(activity.delete_info.content_id);
            }
        }

        return setOps;
    },

};

const dependentFilters = {
    usergroups: { id: { $exists: true } },

    decks: { 'editors.groups.0': { $exists: true } },

    activities: { $or: [
        { 'content_id': { $exists: true }, 'content_kind': 'group' },
        { 'delete_info.content_id': { $exists: true }, 'delete_info.content_kind': 'group' },
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
