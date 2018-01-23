'use strict';

const { promisify } = require('util');

const dbutil = require('../lib/dbutil');

module.exports = {

    execute: async function(argv) {
        let collection = argv.collection;
        let offset = argv.offset;

        let db = await dbutil.connect(argv.db, argv.host, argv.port);
        try {
            let range = await dbutil.getIdRange(db, collection);
            if (range[0] + offset <= 0) {
                return console.error(`Cannot apply offset ${offset} to collection ${collection} (ids in: [${range}]): non-positive ids would be produced`);
            }

            let idTransform = (id) => (id + offset);
            await dbutil.updateReferences(db, collection, idTransform, argv.dry);

            if (argv.dry) return;

            process.stdout.write(`Updating ids in ${collection}...`);

            // after we are done with processing dependents, we can also update the collection itself
            let col = db.collection(collection);
            // we can't update _id in place, so we use aggregation to copy documents while also increasing _id
            col.asyncAggregate = promisify(col.aggregate);
            await col.asyncAggregate([
                { $addFields: { '_id': { $sum: ['$_id', offset] } } },
                { $out: collection },
            ]);
            console.log('done!');

        } catch (err) {
            console.error(err);
        } finally {
            console.log(`Closing connection to ${argv.db}`);
            db.close();
        }

    }

};
