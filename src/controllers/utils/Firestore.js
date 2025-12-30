// Bridge export to the canonical Firestore util under src/controller/utils
// Keeps existing imports like require("./utils/Firestore") working from controllers.
module.exports = require(__root + 'controller/utils/Firestore');
