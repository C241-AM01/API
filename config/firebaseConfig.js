const admin = require('firebase-admin');
const credentials = require('../tracky-6c6e0-firebase-adminsdk-o5101-2ef8a21e65.json');

require('dotenv').config();

function initializeFirebase() {
    admin.initializeApp({
        credential: admin.credential.cert(credentials),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

module.exports = { initializeFirebase };