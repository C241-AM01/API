const admin = require('firebase-admin');
const credentials = require('../serviceAccountKey.json');
require('dotenv').config();

function initializeFirebase() {
    admin.initializeApp({
        credential: admin.credential.cert(credentials),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: process.env.FIREBASE_STORAGE_URL
    });
}

module.exports = { initializeFirebase };