'use strict';

const { getIdentifierTransform } = require('../identifiers');

// each method is named after a collection, and each receives a document of said collection
// the output is a mongo update command object (like { $set : {} } etc)
// the idTransform is a mapping function that turns old ids to new ids
const updateReferencesIn = {
    usergroups: function(usergroup, idTransform) {
        let setOps = {};

        if (usergroup.creator) {
            // fix corrupt data 
            if (usergroup.creator.userid) {
                setOps['creator.userid'] = idTransform(usergroup.creator.userid);
            } else {
                setOps.creator = { userid: idTransform(usergroup.creator) };
            }
        }

        usergroup.members.forEach((user, index) => {
            setOps[`members.${index}.userid`] = idTransform(user.userid);
        });

        return setOps;
    },

    decks: function(deck, idTransform) {
        let setOps = {};

        setOps.user = idTransform(deck.user);
        if (deck.origin) {
            setOps['origin.user'] = idTransform(deck.origin.user);
        }
        if (deck.contributors) {
            deck.contributors.forEach((contr, index) => {
                setOps[`contributors.${index}.user`] = idTransform(contr.user);
            });
        }
        if (deck.editors && deck.editors.users) {
            deck.editors.users.forEach((user, index) => {
                setOps[`editors.users.${index}.id`] = idTransform(user.id);
            });
        }
        deck.revisions.forEach((rev, index) => {
            setOps[`revisions.${index}.user`] = idTransform(rev.user);
        });

        return setOps;
    },

    slides: function(slide, idTransform) {
        let setOps = {};

        setOps.user = idTransform(slide.user);
        if (slide.contributors) {
            slide.contributors.forEach((contr, index) => {
                setOps[`contributors.${index}.user`] = idTransform(contr.user);
            });
        }
        slide.revisions.forEach((rev, index) => {
            setOps[`revisions.${index}.user`] = idTransform(rev.user);
        });

        return setOps;
    },

    tags: function(tag, idTransform) {
        let setOps = {};

        setOps.user = idTransform(tag.user);

        return setOps;
    },

    deckchanges: function(deckchange, idTransform) {
        let setOps = {};

        setOps.user = idTransform(deckchange.user);

        return setOps;
    },

    discussions: function(comment, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        setOps.user_id = identifierTransform(comment.user_id);

        return setOps;
    },

    activities: function(activity, idTransform) {
        let setOps = {};
        let identifierTransform = getIdentifierTransform(idTransform);

        setOps.user_id = identifierTransform(activity.user_id);
        if (activity.content_owner_id) {
            setOps.content_owner_id = identifierTransform(activity.content_owner_id);
        }

        return setOps;
    },

    media: function(medium, idTransform) {
        let setOps = {};

        setOps.owner = idTransform(medium.owner);

        return setOps;
    },

};

const referencePathsFor = {
    usergroups: [
        { path: 'creator', query: { 'creator': { $type: 'int' } } },
        'creator.userid',
        'members.userid',
    ],
    decks: [
        'user',
        'origin.user',
        'contributors.user',
        'editors.users.id',
        'revisions.user',
    ],
    slides: [
        'user',
        'contributors.user',
        'revisions.user',
    ],
    tags: [
        'user',
    ],
    deckchanges: [
        'user',
    ],
    discussions: [
        'user_id',
    ],
    activities: [
        'user_id',
        'content_owner_id',
    ],
    media: [
        'owner',
    ],
};

module.exports = {
    // list with other collections where deck ids are used
    dependents: Object.keys(updateReferencesIn),

    filterFor: function() {
        // all dependents have user references to process
        return {};
    },

    updateReferencesIn: function(col, doc, idTransform){
        return updateReferencesIn[col](doc, idTransform);
    },

    // mongo reference paths for documents inside each dependent
    getReferencePathsFor: function(col) {
        return referencePathsFor[col];
    },

};
