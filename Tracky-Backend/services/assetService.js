const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');
const crypto = require('crypto');
const QRCode = require('qrcode');

const generateQRCode = async (text) => {
    try {
        const qrCodeDataURL = await QRCode.toDataURL(text);
        return qrCodeDataURL;
    } catch (err) {
        console.error("Failed to generate QR code:", err);
        throw new CustomError("Failed to generate QR code", 500);
    }
};

const addAsset = async (req, res) => {
    const { name, description, depreciation, image, purchaseDate, originalPrice, tracker_id } = req.body;

    const trackerRef = admin.database().ref(`tracker/${tracker_id}`);
    const trackerSnapshot = await trackerRef.once('value');
    if (!trackerSnapshot.exists()) {
        return res.status(400).json({ error: "Invalid tracker_id. The specified tracker_id does not exist." });
    }

    const depreciationRate = parseFloat(depreciation) / 100;
    const currentDate = new Date();
    const purchaseDateObject = new Date(purchaseDate);
    const years = (currentDate - purchaseDateObject) / (1000 * 60 * 60 * 24 * 365.25);
    const priceAfterDepreciation = originalPrice * Math.pow((1 - depreciationRate), years);

    try {
        const qrCode = await generateQRCode(name);

        const newAsset = {
            name,
            description,
            depreciationRate,
            image,
            purchaseDate: purchaseDateObject.toISOString(),
            originalPrice,
            priceAfterDepreciation,
            tracker_id, // Assign tracker_id to the asset
            createdBy: req.user.uid,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            approved: false,
            qrCode
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
    const { tracker_id } = req.params;
    try {
        const snapshot = await admin.database().ref(`assets/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }
        res.json({ id: tracker_id, ...snapshot.val() });
    } catch (error) {
        console.error("Error retrieving asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateAsset = async (req, res) => {
    const { tracker_id } = req.params;
    const updates = req.body;
    try {
        const snapshot = await admin.database().ref(`assets/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();
        if (asset.approved) {
            throw new CustomError("Approved asset cannot be edited directly", 403);
        }

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;
        await admin.database().ref(`assets/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Error updating asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const deleteAsset = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`assets/${tracker_id}`).remove();
        res.json({ message: "Asset deleted successfully" });
    } catch (error) {
        console.error("Error deleting asset:", error);
        res.status(500).json({ error: "Error deleting asset" });
    }
};

const requestApproval = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`assets/${tracker_id}`).update({
            approvalRequested: true,
            requestedAt: admin.database.ServerValue.TIMESTAMP,
            requestedBy: req.user.uid
        });
        res.json({ message: "Approval requested successfully" });
    } catch (error) {
        console.error("Failed to request approval:", error);
        res.status(500).json({ error: "Failed to request approval" });
    }
};

const approveAsset = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`assets/${tracker_id}`).update({
            approved: true,
            approvedAt: admin.database.ServerValue.TIMESTAMP,
            approvedBy: req.user.uid,
            approvalRequested: false
        });
        res.json({ message: "Asset approved successfully" });
    } catch (error) {
        console.error("Failed to approve asset:", error);
        res.status(500).json({ error: "Failed to approve asset" });
    }
};

module.exports = {
    addAsset,
    listAssets,
    getAsset,
    updateAsset,
    deleteAsset,
    requestApproval,
    approveAsset
};
