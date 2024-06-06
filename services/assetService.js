const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');
const QRCode = require('qrcode');

const bucket = admin.storage().bucket();

const generateQRCode = async (text) => {
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

const calculateCurrentPrice = (originalPrice, depreciationRate, depreciationValue, purchaseDate) => {
    const currentDate = new Date();
    const purchaseDateObject = new Date(purchaseDate);
    const diffTime = Math.abs(currentDate - purchaseDateObject);
    let timeFactor = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Default to days

    // Determine the time factor based on depreciation value
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
            // Already in days
            break;
    }

    // Ensure depreciationValue is a number
    const depreciationValueNumber = parseFloat(depreciationValue);
    if (isNaN(depreciationValueNumber)) {
        throw new Error("Invalid depreciation rate");
    }

    const currentPrice = originalPrice - (originalPrice * (depreciationValueNumber / 100) * timeFactor);
    return Math.max(currentPrice, 0); // Ensure the current price is not negative
};

const addAsset = async (req, res) => {
    const { name, description, originalPrice, depreciationRate, depreciationValue, purchaseDate, trackerId } = req.body;
    const image = req.file;

    const trackerRef = admin.database().ref(`tracker/${trackerId}`);
    const trackerSnapshot = await trackerRef.once('value');
    if (!trackerSnapshot.exists()) {
        return res.status(400).json({ error: "Invalid tracker_id. The specified tracker_id does not exist." });
    }

    try {
        const qrCode = await generateQRCode(name);

        let uploadedImageURL = null;
        if (image) {
            const destination = `assets/${image.filename}`;
            uploadedImageURL = await uploadFileToStorage(image.path, destination);
        }

        const newAsset = {
            name,
            description,
            originalPrice: originalPrice || 0,
            depreciationRate: depreciationRate || 'daily',
            depreciationValue: depreciationValue || 0,
            purchaseDate: purchaseDate || new Date().toISOString(),
            currentPrice: calculateCurrentPrice(originalPrice || 0, depreciationRate || 'daily', depreciationValue || 0, purchaseDate || new Date().toISOString()),
            imageURL: uploadedImageURL,
            trackerId, // Assign tracker_id to the asset
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
    try {
        const assetsRef = admin.database().ref('assets');
        const snapshot = await assetsRef.once('value');
        const assets = [];

        snapshot.forEach((childSnapshot) => {
            assets.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });

        for (let asset of assets) {
            const qrCode = await generateQRCode(asset.name);
            asset.qrCode = qrCode;
            if (asset.qrCodeURL) {
                await deleteFileFromStorage(asset.qrCodeURL);
            }
        }

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
        const qrCode = await generateQRCode(asset.name);
        asset.qrCode = qrCode;
        if (asset.qrCodeURL) {
            await deleteFileFromStorage(asset.qrCodeURL);
        }

        res.json({ id: asset_id, ...asset });
    } catch (error) {
        console.error("Error retrieving asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateAsset = async (req, res) => {
    const { asset_id } = req.params;
    const updates = req.body;
    const image = req.file;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const oldImageURL = snapshot.val().imageURL;

        if (image) {
            const imageURL = await uploadFileToStorage(image.path, `assets/${image.filename}`);
            updates.imageURL = imageURL;

            if (oldImageURL) {
                await deleteFileFromStorage(oldImageURL);
            }
        }

        const currentPrice = calculateCurrentPrice(
            updates.originalPrice || snapshot.val().originalPrice,
            updates.depreciationRate || snapshot.val().depreciationRate,
            updates.depreciationValue || snapshot.val().depreciationValue,
            updates.purchaseDate || snapshot.val().purchaseDate
        );
        updates.currentPrice = currentPrice;
        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;

        await admin.database().ref(`assets/${asset_id}`).update(updates);
        res.json({ id: asset_id, ...updates });
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

        const imageURL = snapshot.val().imageURL;
        const qrCodeURL = snapshot.val().qrCodeURL;

        await admin.database().ref(`assets/${asset_id}`).remove();

        if (imageURL) {
            await deleteFileFromStorage(imageURL);
        }
        if (qrCodeURL) {
            await deleteFileFromStorage(qrCodeURL);
        }

        res.json({ message: "Asset deleted successfully" });
    } catch (error) {
        console.error("Error deleting asset:", error);
        res.status(500).json({ error: "Error deleting asset" });
    }
};

const requestEdit = async (req, res) => {
    const { tracker_id } = req.params;
    try {
        await admin.database().ref(`assets/${tracker_id}`).update({
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
        await admin.database().ref(`assets/${tracker_id}`).update({
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
    addAsset,
    listAssets,
    getAsset,
    updateAsset,
    deleteAsset,
    requestEdit,
    approveEdit
};
