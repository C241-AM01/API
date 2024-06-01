const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');

const addAsset = async (req, res) => {
    const { name, description, depreciation, image, purchaseDate, price } = req.body;
    try {
        const newAsset = {
            name,
            description,
            depreciation,
            image,
            purchaseDate: new Date(purchaseDate).toISOString(),
            price,
            createdBy: req.user.uid,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            approved: false // Initially not approved
        };
        const assetRef = admin.database().ref('assets').push();
        await assetRef.set(newAsset);
        res.json({ message: "Asset added successfully", id: assetRef.key });
    } catch (error) {
        console.error("Error adding asset:", error);
        res.status(500).json({ error: "Error adding asset" });
    }
};

const listAssets = async (req, res) => {
    const { approved } = req.query;
    try {
        const assetsRef = admin.database().ref('assets');
        const snapshot = await assetsRef.once('value');
        const assets = [];
        snapshot.forEach((childSnapshot) => {
            const asset = childSnapshot.val();
            if (approved === undefined || String(asset.approved) === approved) {
                assets.push({ id: childSnapshot.key, ...asset });
            }
        });
        res.json({ assets });
    } catch (error) {
        console.error("Error retrieving assets:", error);
        res.status(500).json({ error: "Error retrieving assets" });
    }
};

const getAsset = async (req, res) => {
    const { assetId } = req.params;
    try {
        const snapshot = await admin.database().ref(`assets/${assetId}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }
        res.json({ id: assetId, ...snapshot.val() });
    } catch (error) {
        console.error("Error retrieving asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateAsset = async (req, res) => {
    const { assetId } = req.params;
    const updates = req.body;
    try {
        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;
        await admin.database().ref(`assets/${assetId}`).update(updates);
        res.json({ message: "Asset updated successfully" });
    } catch (error) {
        console.error("Error updating asset:", error);
        res.status(500).json({ error: "Error updating asset" });
    }
};

const deleteAsset = async (req, res) => {
    const { assetId } = req.params;
    try {
        await admin.database().ref(`assets/${assetId}`).remove();
        res.json({ message: "Asset deleted successfully" });
    } catch (error) {
        console.error("Error deleting asset:", error);
        res.status(500).json({ error: "Error deleting asset" });
    }
};

const approveAsset = async (req, res) => {
    const { assetId } = req.params;
    try {
        await admin.database().ref(`assets/${assetId}`).update({
            approved: true,
            approvedAt: admin.database.ServerValue.TIMESTAMP,
            approvedBy: req.user.uid
        });
        res.json({ message: "Asset approved successfully" });
    } catch (error) {
        console.error("Error approving asset:", error);
        res.status(500).json({ error: "Error approving asset" });
    }
};

module.exports = { addAsset, listAssets, getAsset, updateAsset, deleteAsset, approveAsset };
