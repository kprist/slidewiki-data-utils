'use strict';

function getIdentifierTransform(idTransform) {
    return (identifier) => {
        let parsed = parseIdentifier(identifier);
        if (!parsed) return;

        parsed.id = idTransform(parsed.id);
        return toIdentifier(parsed);
    };
}

// splits the string identifier to {id, revision}
function parseIdentifier(identifier) {
    let parsed = String(identifier).match(/^(\d+)(?:-(\d+))?$/);

    // return nothing undefined if error
    if (!parsed) return;

    let result = { id: parseInt(parsed[1]) };

    // could be undefined, so don't parse (it would result to NaN)
    let revision = parsed[2] && parseInt(parsed[2]);
    if (revision) {
        result.revision = revision;
    }

    return result;
}

function toIdentifier(ref) {
    // return nothing for null or invalid data
    if (!ref || !ref.id) return;

    let revision = ref.revision ? `-${ref.revision}` : '';
    return `${ref.id}${revision}`;
}

module.exports = {
    getIdentifierTransform,
    parseIdentifier,
    toIdentifier,
};
