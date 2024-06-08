const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const bucket = admin.storage().bucket();

const qrCodeDir = path.join(__dirname, '..', 'uploads', 'qrcodes');

const generateQRCode = async (text) => {
    if (!text || typeof text !== 'string') {
        throw new CustomError("Invalid input for QR code generation", 400);
    }

    try {
        const qrCodeDataURL = await QRCode.toDataURL(text);
        return qrCodeDataURL;
    } catch (err) {
        console.error("Failed to generate QR code:", err);
        throw new CustomError("Failed to generate QR code", 500);
    }
};

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

    let decodedPath;

    try {
        console.log(`Attempting to delete file at URL: ${fileURL}`);
        const url = new URL(fileURL);
        const filePath = url.pathname.split('/').slice(2).join('/');
        decodedPath = decodeURIComponent(filePath);
        console.log(`Decoded file path: ${decodedPath}`);
        const file = bucket.file(decodedPath);
        console.log(`File reference: ${file.name}`);
        await file.delete();
        console.log(`Successfully deleted file: ${decodedPath}`);
    } catch (error) {
        console.error(`Failed to delete file: ${decodedPath}`, error);
        throw new CustomError("Failed to delete file from storage", 500);
    }
};

const calculateCurrentPrice = (originalPrice, depreciationRate, depreciationValue, purchaseDate) => {
    const currentDate = new Date();
    const purchaseDateObject = new Date(purchaseDate);
    const diffTime = Math.abs(currentDate - purchaseDateObject);
    let timeFactor = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    switch (depreciationRate) {
        case 'weekly':
            timeFactor /= 7;
            break;
        case 'monthly':
            timeFactor /= 30;
            break;
        case 'yearly':
            timeFactor /= 365;
            break;
        case 'daily':
        default:
            break;
    }

    const depreciationValueNumber = parseFloat(depreciationValue);
    if (isNaN(depreciationValueNumber) || depreciationValueNumber < 0) {
        throw new Error("Invalid depreciation value, must be more than 0");
    }

    if (timeFactor === 0) {
        return originalPrice;
    }

    const currentPrice = originalPrice - (originalPrice * (depreciationValueNumber / 100) * timeFactor);
    return Math.max(currentPrice, 0);
};

const addAsset = async (req, res) => {
    const { name, description, originalPrice, depreciationRate, depreciationValue, purchaseDate, trackerId } = req.body;
    const image = req.file;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: "Invalid asset name" });
    }

    const trackerRef = admin.database().ref(`tracker/${trackerId}`);
    const trackerSnapshot = await trackerRef.once('value');
    if (!trackerSnapshot.exists()) {
        return res.status(400).json({ error: "Invalid tracker_id. The specified tracker_id does not exist." });
    }

    try {
        const assetsRef = admin.database().ref('assets');
        const assetsSnapshot = await assetsRef.orderByKey().limitToLast(1).once('value');
        let newAssetId = 1;
        assetsSnapshot.forEach(childSnapshot => {
            const highestId = parseInt(childSnapshot.key, 10);
            newAssetId = highestId + 1;
        });

        let uploadedImageURL = null;
        if (image) {
            const fileExtension = path.extname(image.originalname);
            const fileName = `${newAssetId}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', image.filename);
            const destination = `asset/${fileName}`;

            console.log(`Uploading file to storage: ${filePath} to ${destination}`);
            uploadedImageURL = await uploadFileToStorage(filePath, destination);
            console.log(`Uploaded file URL: ${uploadedImageURL}`);
            fs.unlinkSync(filePath);
        }

        const qrCodeBase64 = await generateQRCode(uploadedImageURL);
        const qrCodeBuffer = Buffer.from(qrCodeBase64.split(',')[1], 'base64');

        if (!fs.existsSync(qrCodeDir)) {
            fs.mkdirSync(qrCodeDir, { recursive: true });
        }

        const qrCodeFileName = `${newAssetId}.png`;
        const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);
        fs.writeFileSync(qrCodeFilePath, qrCodeBuffer);

        const qrCodeDestination = `qrcodes/${qrCodeFileName}`;
        console.log(`Uploading QR code to storage: ${qrCodeFilePath} to ${qrCodeDestination}`);
        const qrCodeURL = await uploadFileToStorage(qrCodeFilePath, qrCodeDestination);
        console.log(`Uploaded QR code URL: ${qrCodeURL}`);
        fs.unlinkSync(qrCodeFilePath);

        const newAsset = {
            name,
            description,
            originalPrice,
            depreciationRate,
            depreciationValue,
            purchaseDate,
            currentPrice: calculateCurrentPrice(originalPrice, depreciationRate, depreciationValue, purchaseDate),
            imageURL: uploadedImageURL,
            trackerId,
            createdBy: req.user.uid,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            qrCode: qrCodeURL,
            editRequested: false,
            editRequestedBy: null,
            editRequestedAt: null,
            editApproved: false,
            editApprovedBy: null,
            editApprovedAt: null,
            proposedChanges: null
        };

        const newAssetRef = admin.database().ref(`assets/${newAssetId}`);
        await newAssetRef.set(newAsset);

        res.json({ message: "Asset added successfully", id: newAssetId });
    } catch (error) {
        console.error("Error adding asset:", error);
        res.status(500).json({ error: "Error adding asset" });
    }
};


const listAssets = async (req, res) => {
    try {
        const assetsRef = admin.database().ref('assets');
        const snapshot = await assetsRef.once('value');
        const assets = [];

        snapshot.forEach((childSnapshot) => {
            assets.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });

        res.json({ assets });
    } catch (error) {
        console.error("Error retrieving assets:", error);
        res.status(500).json({ error: "Error retrieving assets" });
    }
};

const getAsset = async (req, res) => {
    const { asset_id } = req.params;
    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();
        res.json({ id: asset_id, ...asset });
    } catch (error) {
        console.error("Error retrieving asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateAsset = async (req, res) => {
    const { asset_id } = req.params;
    const updates = { ...req.body };
    const image = req.file;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();
        const oldImageURL = asset.imageURL;
        const oldQRCodeURL = asset.qrCode;

        if (image) {
            if (oldImageURL) {
                await deleteFileFromStorage(oldImageURL);
            }
            if (oldQRCodeURL) {
                await deleteFileFromStorage(oldQRCodeURL);
            }

            const fileExtension = path.extname(image.originalname);
            const fileName = `${asset_id}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', image.filename);
            const destination = `asset/${fileName}`;

            updates.imageURL = await uploadFileToStorage(filePath, destination);
            fs.unlinkSync(filePath);

            const qrCodeBase64 = await generateQRCode(updates.imageURL);
            const qrCodeBuffer = Buffer.from(qrCodeBase64.split(',')[1], 'base64');

            const qrCodeFileName = `${asset_id}.png`;
            const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);
            fs.writeFileSync(qrCodeFilePath, qrCodeBuffer);

            const qrCodeDestination = `qrcodes/${qrCodeFileName}`;
            updates.qrCode = await uploadFileToStorage(qrCodeFilePath, qrCodeDestination);
            fs.unlinkSync(qrCodeFilePath);
        }

        if (updates.originalPrice || updates.depreciationRate || updates.depreciationValue || updates.purchaseDate) {
            updates.currentPrice = calculateCurrentPrice(
                updates.originalPrice || asset.originalPrice,
                updates.depreciationRate || asset.depreciationRate,
                updates.depreciationValue || asset.depreciationValue,
                updates.purchaseDate || asset.purchaseDate
            );
        }

        await admin.database().ref(`assets/${asset_id}`).update(updates);

        res.json({ message: "Asset updated successfully" });
    } catch (error) {
        console.error("Error updating asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const deleteAsset = async (req, res) => {
    const { asset_id } = req.params;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();

        if (asset.imageURL) {
            await deleteFileFromStorage(asset.imageURL);
        }

        if (asset.qrCode) {
            await deleteFileFromStorage(asset.qrCode);
        }

        await admin.database().ref(`assets/${asset_id}`).remove();

        res.json({ message: "Asset deleted successfully" });
    } catch (error) {
        console.error("Error deleting asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const requestEdit = async (req, res) => {
    const { asset_id } = req.params;
    let updates = req.body;
    const image = req.file;

    try {
        // Ensure updates is a plain object
        if (typeof updates !== 'object' || updates === null) {
            throw new CustomError("Invalid data format", 400);
        }

        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const tracker = snapshot.val();
        const isPIC = req.user.role === 'pic';

        // Ensure the user is PIC
        if (!isPIC) {
            return res.status(403).json({ error: "You do not have permission to request an edit for this asset" });
        }

        const oldImageURL = asset.imageURL;
        const oldQRCodeURL = asset.qrCode;

        if (image) {
            if (oldImageURL) {
                await deleteFileFromStorage(oldImageURL);
            }
            if (oldQRCodeURL) {
                await deleteFileFromStorage(oldQRCodeURL);
            }

            const fileExtension = path.extname(image.originalname);
            const fileName = `${asset_id}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', image.filename);
            const destination = `asset/${fileName}`;

            updates.imageURL = await uploadFileToStorage(filePath, destination);
            fs.unlinkSync(filePath);

            const qrCodeBase64 = await generateQRCode(updates.imageURL);
            const qrCodeBuffer = Buffer.from(qrCodeBase64.split(',')[1], 'base64');

            const qrCodeFileName = `${asset_id}.png`;
            const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);
            fs.writeFileSync(qrCodeFilePath, qrCodeBuffer);

            const qrCodeDestination = `qrcodes/${qrCodeFileName}`;
            updates.qrCode = await uploadFileToStorage(qrCodeFilePath, qrCodeDestination);
            fs.unlinkSync(qrCodeFilePath);
        }
        if (updates.originalPrice || updates.depreciationRate || updates.depreciationValue || updates.purchaseDate) {
            updates.currentPrice = calculateCurrentPrice(
                updates.originalPrice || asset.originalPrice,
                updates.depreciationRate || asset.depreciationRate,
                updates.depreciationValue || asset.depreciationValue,
                updates.purchaseDate || asset.purchaseDate
            );
        }

        updates.editRequested = true;
        updates.editRequestedBy = req.user.uid;
        updates.editRequestedAt = admin.database.ServerValue.TIMESTAMP;

        // Ensure updates is a plain object
        updates = { ...updates };

        await admin.database().ref(`assets/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Error requesting edit:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};


const approveEdit = async (req, res) => {
    const { asset_id } = req.params;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
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
        if (updates.imageURL && tracker.imageURL) {
            await deleteFileFromStorage(tracker.imageURL);
        }
        if (updates.qrCode && tracker.qrCode) {
            await deleteFileFromStorage(tracker.qrCode);
        }

        await admin.database().ref(`assets/${asset_id}`).update({
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

module.exports = {
    addAsset,
    listAssets,
    getAsset,
    updateAsset,
    deleteAsset,
    requestEdit,
    approveEdit
};
