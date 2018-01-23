'use strict';

const {size, isEmpty} = require('lodash');
const ProgressBar = require('progress');

const dbutil = require('../lib/dbutil');

module.exports = {

    execute: async function(argv) {
        let db = await dbutil.connect(argv.db, argv.host, argv.port);
        try {
            // holds the ids of the db users as keys, and the matching ids of the other db users as values
            let userIdsMatched = {};

            let userCursor = db.collection('users').find().project({ _id: 1, email: 1, username: 1});
            let userCount = await userCursor.count();
            let progressBar = new ProgressBar('Matching :total users across databases: :bar (:percent)', { total: userCount });

            let otherDb = await dbutil.connect(argv.other_db, argv.host, argv.port);
            try {
                // we check the ranges in the two databases, they must not overlap!
                let range = await dbutil.getIdRange(db, 'users');
                let otherIdsInRange = await otherDb.collection('users').count({ _id: { $gte: range[0], $lte: range[1] } });
                if (otherIdsInRange) {
                    return console.error(`Cannot match and update users in the databases: ${argv.other_db} includes users in ${argv.db} user_id range [${range}]`);
                }

                for (let user = await userCursor.next(); user != null; user = await userCursor.next()) {
                    progressBar.tick();

                    // find by email alone
                    let otherCursor = otherDb.collection('users')
                        .find({ email: { $regex: new RegExp(`^${escapeRegExp(user.email)}$`, 'i') } })
                        .project({ _id: 1, email: 1, username: 1});

                    let matchedUsers = await otherCursor.toArray();
                    // we expect one user at most, if there are more then there is an error in the other_db data
                    if (matchedUsers.length > 1) {
                        matchedUsers.forEach((matchedUser) => {
                            console.error(`matched ${Object.values(user)} => ${Object.values(matchedUser)}`);
                        });
                        console.error(`more than user with same email found, please verify the integrity of users in ${argv.other_db} and retry`);
                        return;
                    }

                    let matchedUser = matchedUsers[0];
                    if (matchedUser && matchedUser._id !== user._id) {
                        // let's put it in the userIdsMatched if the _id's differ
                        // sign in credentials are the same, so even if the username differs, we are ok
                        userIdsMatched[user._id] = matchedUser._id;
                    } 
                    // otherwise no match found, so no updating here
                }

            } finally {
                console.log(`Closing connection to ${argv.other_db}`);
                otherDb.close();
            }

            if (isEmpty(userIdsMatched)) {
                return console.log('No users matched, nothing to do!');
            }
            console.log(`Found ${size(userIdsMatched)} matches, proceeding to updating database`);

            // now we can construct the idTransform function, based on the userIdsMatched key/value pairs:
            let idTransform = (id) => (userIdsMatched[id] || id);
            // return same id if not found
            // there are also some errors in the database, this way we ignore them by not changing them

            await dbutil.updateReferences(db, 'users', idTransform, argv.dry);

            if (argv.dry) return;

            process.stdout.write('Updating ids in users...');

            // after we are done with processing dependents, we can also update the collection itself
            let col = db.collection('users');
            let bulk = col.initializeOrderedBulkOp();

            let idsInserted = new Set();
            let idsToDelete = [];

            let cursor = col.find();
            for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
                // we check if we need to change the id
                let newId = idTransform(doc._id);
                if (newId === doc._id) continue;

                // flag for removing later
                idsToDelete.push(doc._id);

                if (idsInserted.has(newId)) {
                    // there is a chance more than one users on db are matched to the same user on other_db
                    // in such a case, we still remove the user on db, but skip adding the same _id
                    continue;
                }

                // then add it with new _id...
                doc._id = newId;
                bulk.insert(doc);
                idsInserted.add(newId);
            }

            if (idsToDelete.length > 0) {
                bulk.find({ _id: { $in: idsToDelete  } }).remove();
            } else {
                return console.log('no updates needed or found!');
            }

            await bulk.execute();
            console.log(`done (${idsToDelete.length} updated)!`);

        } catch (err) {
            console.error(err);
        } finally {
            console.log(`Closing connection to ${argv.db}`);
            db.close();
        }

    }

};

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
