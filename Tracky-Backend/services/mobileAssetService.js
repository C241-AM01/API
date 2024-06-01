const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');

const createMobileAsset = async (req, res) => {
    const { name, latitude, longitude, timestamp } = req.body;
    try {
        const ref = await admin.database().ref('mobile-assets').push();
        await ref.set({
            id: ref.key,
            name,
            latitude,
            longitude,
            timestamp,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        });
        res.json({ id: ref.key, name, latitude, longitude, timestamp });
    } catch (error) {
        console.error("Failed to create mobile asset:", error);
        res.status(500).json({ error: "Failed to create mobile asset" });
    }
};

const getMobileAsset = async (req, res) => {
    const { assetId } = req.params;
    try {
        const snapshot = await admin.database().ref(`mobile-assets/${assetId}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Mobile asset not found", 404);
        }
        res.json(snapshot.val());
    } catch (error) {
        console.error("Failed to get mobile asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateMobileAsset = async (req, res) => {
    const { assetId } = req.params;
    const updates = req.body;
    try {
        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;
        await admin.database().ref(`mobile-assets/${assetId}`).update(updates);
        res.json({ id: assetId, ...updates });
    } catch (error) {
        console.error("Failed to update mobile asset:", error);
        res.status(500).json({ error: "Failed to update mobile asset" });
    }
};

const deleteMobileAsset = async (req, res) => {
    const { assetId } = req.params;
    try {
        await admin.database().ref(`mobile-assets/${assetId}`).remove();
        res.json({ id: assetId });
    } catch (error) {
        console.error("Failed to delete mobile asset:", error);
        res.status(500).json({ error: "Failed to delete mobile asset" });
    }
};

const queryMobileAssets = async (req, res) => {
    try {
        const snapshot = await admin.database().ref('mobile-assets').once('value');
        const assets = [];
        snapshot.forEach(childSnapshot => {
            assets.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });
        res.json(assets);
    } catch (error) {
        console.error("Failed to query mobile assets:", error);
        res.status(500).json({ error: "Failed to query mobile assets" });
    }
};

module.exports = { createMobileAsset, getMobileAsset, updateMobileAsset, deleteMobileAsset, queryMobileAssets };
