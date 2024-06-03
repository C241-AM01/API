const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');

const createTracker = async (req, res) => {
    const { tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNumber } = req.body;

    if (!tracker_id) {
        return res.status(400).json({ error: "tracker_id is required" });
    }

    try {
        const ref = admin.database().ref(`tracker/${tracker_id}`);
        await ref.set({
            tracker_id,
            name,
            latitude,
            longitude,
            timestamp,
            vehicleType, 
            plateNumber, 
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            approved: false, 
            createdBy: req.user.uid,
        });
        res.json({ tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNumber });
    } catch (error) {
        console.error("Failed to create tracker asset:", error);
        res.status(500).json({ error: "Failed to create tracker asset" });
    }
};


const getTracker = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }
        res.json(snapshot.val());
    } catch (error) {
        console.error("Failed to get tracker asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateTracker = async (req, res) => {
    const { tracker_id } = req.params;
    const updates = req.body;
    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const tracker = snapshot.val();
        if (tracker.approved && !tracker.editApproved) {
            throw new CustomError("Approved tracker cannot be edited without approval", 403);
        }

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;
        await admin.database().ref(`tracker/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });

        if (tracker.editApproved) {
            await admin.database().ref(`tracker/${tracker_id}`).update({
                editApproved: false,
                editApprovedAt: null,
                editApprovedBy: null
            });
        }
    } catch (error) {
        console.error("Failed to update tracker asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};


const deleteTracker = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`tracker/${tracker_id}`).remove();
        res.json({ message: "Tracker deleted successfully" });
    } catch (error) {
        console.error("Failed to delete tracker:", error);
        res.status(500).json({ error: "Failed to delete tracker" });
    }
};

const queryTracker = async (req, res) => {
    const { approved } = req.query;
    try {
        const assetsRef = admin.database().ref('tracker');
        const snapshot = await assetsRef.once('value');
        const assets = [];
        snapshot.forEach((childSnapshot) => {
            const asset = childSnapshot.val();
            if (approved === undefined || String(asset.approved) === approved) {
                assets.push({ id: childSnapshot.key, ...asset });
            }
        });
        res.json({ tracker: assets });
    } catch (error) {
        console.error("Failed to query tracker:", error);
        res.status(500).json({ error: "Failed to query tracker" });
    }
};

const requestEdit = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`tracker/${tracker_id}`).update({
            editRequested: true,
            editRequestedAt: admin.database.ServerValue.TIMESTAMP,
            editRequestedBy: req.user.uid
        });
        res.json({ message: "Edit request submitted successfully" });
    } catch (error) {
        console.error("Failed to request edit:", error);
        res.status(500).json({ error: "Failed to request edit" });
    }
};

const approveEdit = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`tracker/${tracker_id}`).update({
            editApproved: true,
            editApprovedAt: admin.database.ServerValue.TIMESTAMP,
            editApprovedBy: req.user.uid,
            editRequested: false
        });
        res.json({ message: "Edit request approved successfully" });
    } catch (error) {
        console.error("Failed to approve edit:", error);
        res.status(500).json({ error: "Failed to approve edit" });
    }
};

const updateLocation = async (req, res) => {
    const { tracker_id } = req.params;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "latitude and longitude are required" });
    }

    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const updates = {
            latitude,
            longitude,
            timestamp: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        };

        await admin.database().ref(`tracker/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Failed to update tracker location:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};



module.exports = {
    createTracker: createTracker,
    getTracker: getTracker,
    updateTracker,
    deleteTracker,
    queryTracker,
    requestEdit,
    approveEdit,
    updateLocation
};
