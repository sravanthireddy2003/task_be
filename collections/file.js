const fs = require('fs');
const path = require('path');

// Load the collection JSON shipped with the repo
const collection = require(path.join(__dirname, 'employee.postman_collection.json'));

function getCollection() {
  return collection;
}

function saveTo(targetPath) {
  const out = JSON.stringify(collection, null, 2);
  fs.writeFileSync(targetPath, out, 'utf8');
}

function printSummary() {
  console.log('Collection:', collection.info && collection.info.name);
  console.log('Requests:', Array.isArray(collection.item) ? collection.item.length : 0);
  console.log('Base URL variable:', (collection.variable || []).find(v => v.key === 'baseUrl')?.value || '<none>');
}

module.exports = { getCollection, saveTo, printSummary };
