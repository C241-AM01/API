const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

const bucket = admin.storage().bucket();

const uploadFileToStorage = async (filePath, destination) => {
    try {
        await bucket.upload(filePath, {
            destination,
            metadata: {
                cacheControl: 'public,max-age=31536000',
            },
        });
        const file = bucket.file(destination);
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491',
        });
        return url;
    } catch (error) {
        console.error("Failed to upload file to Firebase Storage:", error);
        throw new CustomError("Failed to upload file", 500);
    }
};

const deleteFileFromStorage = async (url) => {
    try {
        const filePath = decodeURIComponent(url.split('/').pop());
        const file = bucket.file(filePath);
        await file.delete();
        console.log(`Successfully deleted file: ${filePath}`);
    } catch (error) {
        console.error(`Failed to delete file: ${url}`, error);
    }
};

const createTracker = async (req, res) => {
    const { tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNum, description } = req.body;

    if (!tracker_id || longitude == null || latitude == null || !timestamp) {
        return res.status(400).json({ error: "tracker_id, longitude, latitude, and timestamp are required" });
    }

    let uploadedImageURL = null;
    if (req.file) {
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `${tracker_id}${fileExtension}`;
        const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
        const destination = `tracked_vehicle/${fileName}`;

        console.log(`Uploading file to storage: ${filePath} to ${destination}`);
        uploadedImageURL = await uploadFileToStorage(filePath, destination);
        console.log(`Uploaded file URL: ${uploadedImageURL}`);
        fs.unlinkSync(filePath);
    }

    const locationHistory = {
        [timestamp]: [longitude, latitude]
    };

    try {
        const ref = admin.database().ref(`tracker/${tracker_id}`);
        await ref.set({
            tracker_id,
            name,
            locationHistory,
            description,
            vehicleType, 
            plateNum,
            image: uploadedImageURL,  // Include the uploaded image URL here
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            approved: false,
            createdBy: req.user.uid
        });
        res.json({ tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNum, image: uploadedImageURL });
    } catch (error) {
        console.error("Failed to create tracker asset:", error);
        res.status(500).json({ error: "Failed to create tracker asset" });
    }
};

const listTrackers = async (req, res) => {
    try {
        const trackersRef = admin.database().ref('tracker');
        const snapshot = await trackersRef.once('value');
        const trackers = [];
        snapshot.forEach((childSnapshot) => {
            trackers.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });
        res.json({ trackers });
    } catch (error) {
        console.error("Error retrieving trackers:", error);
        res.status(500).json({ error: "Error retrieving trackers" });
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
    const { image } = req.file || {};
    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const tracker = snapshot.val();
        if (tracker.approved && !tracker.editApproved) {
            throw new CustomError("Approved tracker cannot be edited without approval", 403);
        }

        if (image) {
            const fileExtension = path.extname(image.originalname);
            const fileName = `${tracker_id}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', image.filename);
            const destination = `tracked_vehicle/${fileName}`;
            
            console.log(`Uploading file to storage: ${filePath} to ${destination}`);
            const uploadedImageURL = await uploadFileToStorage(filePath, destination);
            console.log(`Uploaded file URL: ${uploadedImageURL}`);
            fs.unlinkSync(filePath);
            updates.vehicleImage = uploadedImageURL;

            if (tracker.vehicleImage) {
                await deleteFileFromStorage(tracker.vehicleImage);
            }
        }

        if (updates.longitude != null && updates.latitude != null && updates.timestamp) {
            const locationHistory = snapshot.val().locationHistory || {};
            locationHistory[updates.timestamp] = [updates.longitude, updates.latitude];
            updates.locationHistory = locationHistory;
        }

        if (updates.assignedAsset && updates.assignedAsset !== tracker.assignedAsset) {
            if (tracker.assignedAsset) {
                await admin.database().ref(`assets/${tracker.assignedAsset}`).update({ trackerId: null });
            }
            await admin.database().ref(`assets/${updates.assignedAsset}`).update({ trackerId: tracker_id });
        }

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;
        await admin.database().ref(`tracker/${tracker_id}`).update(updates);

        if (tracker.editApproved) {
            await admin.database().ref(`tracker/${tracker_id}`).update({
                editApproved: false,
                editApprovedAt: null,
                editApprovedBy: null
            });
        }

        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Failed to update tracker asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const deleteTracker = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const vehicleImageURL = snapshot.val().vehicleImage;
        await admin.database().ref(`tracker/${tracker_id}`).remove();

        if (vehicleImageURL) {
            await deleteFileFromStorage(vehicleImageURL);
        }

        res.json({ message: "Tracker deleted successfully" });
    } catch (error) {
        console.error("Error deleting tracker:", error);
        res.status(500).json({ error: "Error deleting tracker" });
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

module.exports = {
    createTracker,
    getTracker,
    updateTracker,
    deleteTracker,
    listTrackers,
    requestEdit,
    approveEdit
};
