'use strict';

const MongoClient = require('mongodb').MongoClient;
const ProgressBar = require('progress');

const processors = require('./processors');

async function connect(host='localhost', port=27017) {
    // Initialize connection once
    let client = await MongoClient.connect(`mongodb://${host}:${port}`);
    console.log(`Connected to mongo instance ${host}:${port}`);
    return client;
}

// returns the { min, max } ids of the collection in the database
async function getIdRange(db, collection) {
    let cursor = db.collection(collection).aggregate([
        { $group: {
            _id: null,
            min_id: { $min: '$_id' },
            max_id: { $max: '$_id' },
        } }
    ]);

    let results = await cursor.toArray();
    if (results.length) {
        return [results[0].min_id, results[0].max_id];
    } else {
        return [-Number.Infinity, Number.Infinity];
    }
}

// update references according to idTransform
async function updateReferences(db, collection, idTransform, dryRun=false, logger=console) {
    let processor = processors.get(collection);
    if (!processor) {
        throw new Error(`Unknown or unsupported for id shifting collection: ${collection}`);
    }

    for (let dependent of processor.dependents) {
        logger.log(`Processing ${collection} ids referenced in ${dependent}:`);

        let col = db.collection(dependent);
        let bulk = col.initializeUnorderedBulkOp();
        let cursor = col.find(processor.filterFor(dependent));
        
        let docCount = await cursor.count();
        let progressBar;
        if (!dryRun) {
            progressBar = new ProgressBar('    preparing update for :total documents: :bar (:percent)', { total: docCount });
        }

        for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {

            try {
                if (progressBar) progressBar.tick();

                let setOp = processor.updateReferencesIn(dependent, doc, idTransform);
                if (Object.keys(setOp).length === 0) {
                    // logger.warn(`no references to update in document ${JSON.stringify(doc)}`);
                    continue;
                }

                if (dryRun) {
                    logger.log(dependent, { _id: doc._id }, { $set: setOp });
                } else {
                    bulk.find({ _id: doc._id }).updateOne({ $set: setOp });
                }

            } catch (e) {
                throw new Error(`invalid data in ${dependent} document ${JSON.stringify(doc)}\n    cause was: ${e}`);
            }

        }

        if (dryRun) continue; // next dependent

        if (bulk.length === 0) {
            logger.log('    no updates needed or found');
            continue; // next dependent
        }

        // now we can execute the bulkop
        process.stdout.write('    applying update...');
        await bulk.execute();
        logger.log('done!');
    }
}

module.exports = {
    connect,
    getIdRange,
    updateReferences,
};
