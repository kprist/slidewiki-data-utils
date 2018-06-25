'use strict';

const _ = require('lodash');
const ISO6391 = require('iso-639-1');

const dbutil = require('../lib/dbutil');

module.exports = {

    execute: async function(argv) {
        let client = await dbutil.connect(argv.host, argv.port);
        let autofix = !!argv.autofix;
        try {
            let db = client.db(argv.db);
            console.log(`Using "${argv.db}"" database`);

            await ensureLanguageIndexes(db);

            let decks = db.collection('decks'), slides = db.collection('slides');

            process.stdout.write('Computing replacements...');
            let replacements = await prepareReplacements(db);
            if (_.isEmpty(replacements)) {
                console.log('none needed!');
            } else {
                console.log(`${_.size(replacements)} distinct codes need to be replaced`);
                for (let [fromValue, toValue] of Object.entries(replacements)) {
                    console.log(`\t${String(fromValue).padEnd(5)} => ${toValue}...`);
                    await replaceLanguage(fromValue, toValue, decks);
                    await replaceLanguage(fromValue, toValue, slides);
                }
            }

            console.log('Checking consistency between documents and revisions...');

            // reporting
            let decksMixedLanguage = await reportChangedAcrossRevisions(decks, 'language', autofix && pickLanguage);
            // for the docs NOT in the resulting array, we can safely pick a language if all revisions have the same
            let decksMismatchedLanguage = await reportDocRevValueMismatch(decks, 'language', autofix && pickLanguage, decksMixedLanguage);
            if (!decksMixedLanguage.length && !decksMismatchedLanguage) {
                console.log('All decks languages are valid and consistent!');
            }

            let slidesMixedLanguage = await reportChangedAcrossRevisions(slides, 'language', autofix && pickLanguage);
            // for the docs NOT in the resulting array, we can safely pick a language if all revisions have the same
            let slidesMismatchedLanguage = await reportDocRevValueMismatch(slides, 'language', autofix && pickLanguage, slidesMixedLanguage);
            if (!slidesMixedLanguage.length && !slidesMismatchedLanguage) {
                console.log('All slides languages are valid and consistent!');
            }

        } catch (err) {
            // make sure a new line is there before writing to error
            console.log();
            console.error(err);
        } finally {
            client.close();
        }
    }

};

async function ensureLanguageIndexes(db) {
    process.stdout.write('Creating indexes...');

    await db.collection('decks').createIndexes([
        { key: {'language': 1} },
        { key: {'revisions.language': 1} },
    ]);

    await db.collection('slides').createIndexes([
        { key: {'language': 1} },
        { key: {'revisions.language': 1} },
    ]);

    console.log('done!');
}

const defaultLang = 'en';

// reads distinct values of language codes from db and returns a mapping to truncated/corrected values
async function prepareReplacements(db) {
    let dbValues = [];

    dbValues.push(...await db.collection('decks').distinct('language'));
    dbValues.push(...await db.collection('slides').distinct('language'));
    dbValues.push(...await db.collection('decks').distinct('revisions.language'));
    dbValues.push(...await db.collection('slides').distinct('revisions.language'));

    // make them unique again
    dbValues = _.uniq(dbValues).sort();

    // filter out null values, truncate the rest, replace non-trivial invalids with 'en', some other invalids with null
    let replacements = dbValues.filter((l) => l !== null).map((lang) => {
        if (!lang || lang === '_'/* || typeof lang !== 'string'*/) {
            return [lang, null];
        }

        let replacement = lang.substring(0, 2).toLowerCase();
        // validate
        if (!ISO6391.validate(replacement)) {
            console.log(`found invalid language code ${lang}, replacing with ${defaultLang}`);
            return [lang, defaultLang];
        }

        return [lang, replacement];
    }).filter(([lang, replacement]) => lang !== replacement);

    // return an object
    return _.fromPairs(replacements);
}

async function replaceLanguage(fromValue, toValue, col) {
    // root level language
    let { modifiedCount: docCount } = await col.updateMany({ 'language': fromValue }, { $set: { 'language': toValue } });
    if (docCount) {
        console.log(`\t\tfixed ${docCount} ${col.s.name}`);
    }

    let revisionCount = 0, modifiedCount = 1; // init to run the loop at least once
    while (modifiedCount > 0) {
        ( { modifiedCount } = await col.updateMany({ 'revisions.language': fromValue }, { $set: { 'revisions.$.language': toValue } }) );
        revisionCount += modifiedCount;
    }
    if (revisionCount) {
        console.log(`\t\tfixed ${revisionCount} ${col.s.name} revisions`);
    }

    if (!docCount && !revisionCount) {
        console.log(`\t\tno replacements needed in ${col.s.name}`);
    }
}


async function reportChangedAcrossRevisions(col, field, pickValue) {
    let colName = col.s.name;

    let aggr = col.aggregate([
        { $unwind: '$revisions' },
        { $group: {
            _id: {
                id: '$_id',
                [field]: `$revisions.${field}`,
            },
            docValue: { $first: `$${field}` },
        } },
        { $group: {
            _id: '$_id.id',
            docValue: { $first: '$docValue' },
            revValues: { $push: `$_id.${field}` },
        } },
        { $match: { 'revValues.1': { $exists: true } } },
    ]);

    let documents = await aggr.toArray();
    if (documents.length) {
        // for each id here we will pick the value if enabled
        let fixValues = {};

        console.log();
        console.log(`Found ${documents.length} documents in ${colName} with changes in ${field} across revisions:`);
        console.log(['id', 'doc_value', 'rev_values'].map((s) => s.padEnd(10)).join('|'));
        for (let doc of documents) {
            console.log([String(doc._id), String(doc.docValue), doc.revValues.map(String).join(',')].map((s) => s.padEnd(10)).join('|'));

            // if pickValue is provided, we will try and fix them automatically
            if (_.isFunction(pickValue)) {
                // we gather the fixable records here
                let value = pickValue(doc.docValue, ...doc.revValues);
                if (value) {
                    fixValues[doc._id] = value;
                }
            }
        }

        if (!_.isEmpty(fixValues)) {
            // let's fix em!
            process.stdout.write(`Trying to fix mismatched ${field} values in the revisions of ${_.size(fixValues)} ${colName}...`);

            for (let [_id, value] of Object.entries(fixValues)) {
                let query = { _id: Number.parseInt(_id) };
                let doc = await col.findOne(query);

                // apply the fix
                doc[field] = value;
                doc.revisions.forEach((r) => r[field] = value);
                // replace it
                await col.findOneAndReplace(query, doc);
            }

            console.log('done!');

            // recompute the report, without autofix
            return reportChangedAcrossRevisions(col, field);
        }
    }

    return _.map(documents, '_id');
}

// pickValue if provided is a function that returns the prefered value among the ones provided
// and the method will also update the proper field to match with the preferred language
// if none is returned, no fix will be applied to that value
async function reportDocRevValueMismatch(col, field, pickValue, excludeIds) {
    let colName = col.s.name;

    let pipeline = [
        { $match: { [field]: { $ne: null } } },
        { $unwind: '$revisions' },
        { $match: { 'revisions.language': { $ne: null } } },
        { $project: {
            _id: 1,
            revisionCount: 1,
            revision: '$revisions.id',
            docValue: '$' + field,
            revisionValue: '$revisions.' + field,
        } },
        { $addFields: {
            distinct: { $ne: [ '$docValue', '$revisionValue'] }
        } },
        { $match: { distinct: true } },
    ];

    let aggr = col.aggregate(pipeline.concat(
        { $group: {
            _id: {
                docValue: '$docValue',
                revisionValue: '$revisionValue'
            },
            count: { $sum: 1 },
        } }
    ));

    let groups = await aggr.toArray();
    if (groups.length) {
        let docCount = _.sumBy(groups, 'count');
        console.log();
        console.log(`Found ${docCount} documents in ${colName} with distinct values for ${field} in document and revision level:`);
        console.log(['count', 'doc_value', 'rev_value'].map((s) => s.padEnd(10)).join('|'));
        for (let group of groups) {
            console.log([String(group.count), String(group._id.docValue), String(group._id.revisionValue)].map((s) => s.padEnd(10)).join('|'));
        }
    }

    if (groups.length && _.isFunction(pickValue)) {
        process.stdout.write(`Trying to fix mismatched ${field} values in ${colName}...`);

        // gather the affected document ids and values
        let mismatches = await col.aggregate([
            // exclude the doc ids in first match
            { $match: { _id: { $nin: excludeIds } } },
            ...pipeline,
        ]).toArray();
        for (let mismatch of mismatches) {
            let query = { _id: mismatch._id };
            let doc = await col.findOne(query);
            let value = pickValue(doc[field], doc.revisions[field]);
            if (!value) continue;

            // apply the fix
            doc[field] = value;
            doc.revisions.forEach((r) => r[field] = value);
            // replace it
            await col.findOneAndReplace(query, doc);
        }

        console.log('done, recomputing...');
        return reportDocRevValueMismatch(col, field);
    }

    return groups.length;
}

function pickLanguage(...codes) {
    // we simply remove default, and falsy values and return the value if only one unique value is left
    let result = _.uniq(codes.filter((c) => c && c !== defaultLang));
    if (result.length === 1) {
        return result[0];
    } else if (result.length === 0) {
        // only falsy or default provided, return default
        return defaultLang;
    }
    // else return nothing, can't safely pick one
}
