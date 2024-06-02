const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');

const createMobileAsset = async (req, res) => {
    const { tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNumber } = req.body;

    // Ensure tracker_id is provided
    if (!tracker_id) {
        return res.status(400).json({ error: "tracker_id is required" });
    }

    try {
        const ref = admin.database().ref(`mobile-assets/${tracker_id}`);
        await ref.set({
            tracker_id,
            name,
            latitude,
            longitude,
            timestamp,
            vehicleType, // Add vehicleType to mobileAsset
            plateNumber, // Add plateNumber to mobileAsset
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            approved: false, // Initially not approved
            createdBy: req.user.uid,
        });
        res.json({ tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNumber });
    } catch (error) {
        console.error("Failed to create mobile asset:", error);
        res.status(500).json({ error: "Failed to create mobile asset" });
    }
};


const getMobileAsset = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        const snapshot = await admin.database().ref(`mobile-assets/${tracker_id}`).once('value');
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
    const { tracker_id } = req.params;
    const updates = req.body;
    try {
        const snapshot = await admin.database().ref(`mobile-assets/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Mobile asset not found", 404);
        }

        const mobileAsset = snapshot.val();
        if (mobileAsset.approved) {
            throw new CustomError("Approved mobile asset cannot be edited directly", 403);
        }

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;
        await admin.database().ref(`mobile-assets/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Failed to update mobile asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const deleteMobileAsset = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`mobile-assets/${tracker_id}`).remove();
        res.json({ message: "Mobile asset deleted successfully" });
    } catch (error) {
        console.error("Failed to delete mobile asset:", error);
        res.status(500).json({ error: "Failed to delete mobile asset" });
    }
};

const queryMobileAssets = async (req, res) => {
    const { approved } = req.query;
    try {
        const assetsRef = admin.database().ref('mobile-assets');
        const snapshot = await assetsRef.once('value');
        const assets = [];
        snapshot.forEach((childSnapshot) => {
            const asset = childSnapshot.val();
            if (approved === undefined || String(asset.approved) === approved) {
                assets.push({ id: childSnapshot.key, ...asset });
            }
        });
        res.json({ mobileAssets: assets });
    } catch (error) {
        console.error("Failed to query mobile assets:", error);
        res.status(500).json({ error: "Failed to query mobile assets" });
    }
};

const requestApproval = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`mobile-assets/${tracker_id}`).update({
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

const approveMobileAsset = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`mobile-assets/${tracker_id}`).update({
            approved: true,
            approvedAt: admin.database.ServerValue.TIMESTAMP,
            approvedBy: req.user.uid,
            approvalRequested: false
        });
        res.json({ message: "Mobile asset approved successfully" });
    } catch (error) {
        console.error("Failed to approve mobile asset:", error);
        res.status(500).json({ error: "Failed to approve mobile asset" });
    }
};

module.exports = {
    createMobileAsset,
    getMobileAsset,
    updateMobileAsset,
    deleteMobileAsset,
    queryMobileAssets,
    requestApproval,
    approveMobileAsset
};
