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

const deleteFileFromStorage = async (fileURL) => {
    if (!fileURL) {
        console.error("File URL is not provided or is invalid");
        return;
    }

    let decodedPath; // Declare decodedPath here to ensure it is defined within the catch block

    try {
        // Log the URL being processed
        console.log(`Attempting to delete file at URL: ${fileURL}`);

        // Validate and extract file path from the URL
        const url = new URL(fileURL);
        const filePath = url.pathname.split('/').slice(2).join('/'); // Adjust to handle GCS URL format

        // Decode the file path
        decodedPath = decodeURIComponent(filePath);

        // Log the decoded path
        console.log(`Decoded file path: ${decodedPath}`);

        // Get a reference to the file
        const file = bucket.file(decodedPath);

        // Log the file reference information
        console.log(`File reference: ${file.name}`);

        await file.delete();
        console.log(`Successfully deleted file: ${decodedPath}`);
    } catch (error) {
        console.error(`Failed to delete file: ${decodedPath}`, error);
        throw new Error("Failed to delete file from storage");
    }
};

const createTracker = async (req, res) => {
    const { tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNum, description, mobile } = req.body;

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

    // Convert mobile to boolean if it's a string, considering all cases
    const mobileFlag = (mobile === 'true' || mobile === true);

    try {
        const ref = admin.database().ref(`tracker/${tracker_id}`);
        await ref.set({
            tracker_id,
            name,
            locationHistory,
            description,
            vehicleType,
            plateNum,
            image: uploadedImageURL,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            createdBy: req.user.uid,
            mobile: mobileFlag
        });
        res.json({ tracker_id, name, latitude, longitude, timestamp, vehicleType, plateNum, image: uploadedImageURL, mobile: mobileFlag });
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
    let updates = req.body;

    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ error: "Tracker not found" });
        }

        const tracker = snapshot.val();
        const isAdmin = req.user.role === 'admin';

        // Check if user is allowed to update
        if (!isAdmin) {
            return res.status(403).json({ error: "You do not have permission to edit this tracker" });
        }

        let uploadedImageURL = null;
        if (req.file) {
            // If a new image is being uploaded, delete the old image
            if (tracker.image) {
                await deleteFileFromStorage(tracker.image);
            }

            const fileExtension = path.extname(req.file.originalname);
            const fileName = `${tracker_id}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
            const destination = `tracked_vehicle/${fileName}`;

            console.log(`Uploading new file to storage: ${filePath} to ${destination}`);
            uploadedImageURL = await uploadFileToStorage(filePath, destination);
            console.log(`Uploaded new file URL: ${uploadedImageURL}`);
            fs.unlinkSync(filePath);
            
            // Include the new image URL in the updates
            updates.image = uploadedImageURL;
        }

        // Ensure the mobile flag is a boolean if it's being updated
        if (updates.mobile !== undefined) {
            updates.mobile = updates.mobile === 'true' || updates.mobile === true;
        }

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;

        // Ensure updates is a plain object
        updates = { ...updates };

        console.log(`Updates: ${JSON.stringify(updates)}`);

        await admin.database().ref(`tracker/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Error updating tracker:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const deleteTracker = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        console.log(`Deleting tracker with ID: ${tracker_id}`);

        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const trackerData = snapshot.val();
        const vehicleImageURL = trackerData.image;

        console.log(`Tracker data:`, trackerData);

        await admin.database().ref(`tracker/${tracker_id}`).remove();

        if (vehicleImageURL) {
            console.log(`Deleting vehicle image at URL: ${vehicleImageURL}`);
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
    let updates = req.body;

    try {
        // Ensure updates is a plain object
        if (typeof updates !== 'object' || updates === null) {
            throw new CustomError("Invalid data format", 400);
        }

        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const tracker = snapshot.val();
        const isPIC = req.user.role === 'pic';

        // Ensure the user is PIC
        if (!isPIC) {
            return res.status(403).json({ error: "You do not have permission to request an edit for this tracker" });
        }

        let uploadedImageURL = null;
        if (req.file) {
            // If a new image is being uploaded, delete the old image
            if (tracker.image) {
                await deleteFileFromStorage(tracker.image);
            }

            const fileExtension = path.extname(req.file.originalname);
            const fileName = `${tracker_id}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
            const destination = `tracked_vehicle/${fileName}`;

            console.log(`Uploading new file to storage: ${filePath} to ${destination}`);
            uploadedImageURL = await uploadFileToStorage(filePath, destination);
            console.log(`Uploaded new file URL: ${uploadedImageURL}`);
            fs.unlinkSync(filePath);

            // Include the new image URL in the updates
            updates.image = uploadedImageURL;
        }

        updates.editRequested = true;
        updates.editRequestedBy = req.user.uid;
        updates.editRequestedAt = admin.database.ServerValue.TIMESTAMP;

        // Ensure updates is a plain object
        updates = { ...updates };

        await admin.database().ref(`tracker/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Error requesting edit:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};


const approveEdit = async (req, res) => {
    const { tracker_id } = req.params;

    try {
        const snapshot = await admin.database().ref(`tracker/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Tracker not found", 404);
        }

        const tracker = snapshot.val();
        const isAdmin = req.user.role === 'admin';

        if (!isAdmin) {
            return res.status(403).json({ error: "Only admin can approve edits" });
        }

        if (!tracker.editRequested) {
            return res.status(400).json({ error: "No edit request found" });
        }

        const updates = tracker.pendingUpdates || {};

        // Apply updates, including new image URL if present
        if (updates.image && tracker.image) {
            await deleteFileFromStorage(tracker.image);
        }

        await admin.database().ref(`tracker/${tracker_id}`).update({
            ...updates,
            editApproved: false,
            editApprovedBy: req.user.uid,
            editApprovedAt: admin.database.ServerValue.TIMESTAMP,
            editRequested: false,
            editRequestedBy: null,
            editRequestedAt: null,
            pendingUpdates: null
        });

        res.json({ message: "Edit request approved successfully", updates });
    } catch (error) {
        console.error("Error approving edit:", error);
        res.status(500).json({ error: "Error approving edit" });
    }
};

const addLocationHistory = async (req, res) => {
    const { tracker_id } = req.params;
    const { longitude, latitude, timestamp } = req.body;

    if (!tracker_id || !longitude || !latitude || !timestamp) {
        return res.status(400).json({ error: "tracker_id, longitude, latitude, and timestamp are required" });
    }

    try {
        const ref = admin.database().ref(`tracker/${tracker_id}`);
        const trackerSnapshot = await ref.once('value');
        if (!trackerSnapshot.exists()) {
            return res.status(404).json({ error: "Tracker not found" });
        }

        const tracker = trackerSnapshot.val();
        console.log(`Tracker mobile flag: ${tracker.mobile}`); // Log the value of the mobile flag

        if (!tracker.mobile) {
            return res.status(400).json({ error: "Cannot add location history. The tracker is not mobile." });
        }

        const locationHistoryRef = ref.child('locationHistory');
        const locationHistory = {};
        locationHistory[timestamp] = [longitude, latitude];
        await locationHistoryRef.update(locationHistory);

        res.json({ message: "Location history added successfully" });
    } catch (error) {
        console.error("Failed to add location history:", error);
        res.status(500).json({ error: "Failed to add location history" });
    }
};




module.exports = {
    createTracker,
    getTracker,
    updateTracker,
    deleteTracker,
    listTrackers,
    requestEdit,
    approveEdit,
    addLocationHistory
};
