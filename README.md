# slidewiki-data-utils
A set of command line utilities that help with managing slidewiki data

## Installation

`$ npm install`

## Usage

```
bin/slidewiki-data <command> [options]

Commands:
  truncatelang <db>                     truncates the language fields in decks,
                                        slides collections, replaces invalid
                                        values with "en"
  shiftids <db> <collection> <offset>   shift the _id attribute for all
                                        documents in <collection> by <offset>,
                                        updating references in all other
                                        collections
  matchusers <db> <other_db>            update the _id attribute for all users
                                        in <db> with the _id of matching users
                                        in <other_db>, while also updating
                                        references in all other collections in
                                        <db>
  purgeusers <db>                       safely remove all users that are not
                                        referenced by id in any other collection

Options:
  --fix-*        add as many flags as manual fixes, and provide the replacement,
                 e.g. --replace-iw_IW=he-IL                             [string]
  --autofix      try to automatically fix language code mismatches between
                 document and their revisions                   [default: false]
  --version      Show version number                                   [boolean]
  --port         port to connect to                             [default: 27017]
  --host         host to connect to                       [default: "localhost"]
  --dry                                                         [default: false]
  --verbose, -v                                                 [default: false]
  --help         Show help                                             [boolean]

```

### Truncating Languages

The command first truncates all language fields to the first two characters;
while doing so, it also validates each code and if any invalids are found they
are replaced with "en".

It then verifies that:
- each deck/slide retains the same value across its revisions. If there are 
documents with variant language across revisions, and --autofix is enabled,
the command will set the language to a single value, if there are at most 
2 unique languages and one of them is 'en'. It will then set the language to 
the other language in the set.
- each deck/slide has the same language both at the document level and the 
revision level; if --autofix is enabled, and for those documents that the 
first check has passed (i.e. all their revisions have the same language),
the command will again set a single language on both levels if possible,
using the same criteria as in the first check.

