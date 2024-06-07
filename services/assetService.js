const admin = require('firebase-admin');
const { CustomError } = require('../exceptions/customError');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const bucket = admin.storage().bucket();

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

const calculateCurrentPrice = (originalPrice, depreciationRate, depreciationValue, purchaseDate) => {
    const currentDate = new Date();
    const purchaseDateObject = new Date(purchaseDate);
    const diffTime = Math.abs(currentDate - purchaseDateObject);
    let timeFactor = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Default to days

    // Determine the time factor based on depreciation rate
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

    // Ensure depreciationValue is a number and within a reasonable range
    const depreciationValueNumber = parseFloat(depreciationValue);
    if (isNaN(depreciationValueNumber) || depreciationValueNumber < 0) {
        throw new Error("Invalid depreciation value, must be more than 0");
    }

    // If the asset was just purchased today, return the original price
    if (timeFactor === 0) {
        return originalPrice;
    }

    const currentPrice = originalPrice - (originalPrice * (depreciationValueNumber / 100) * timeFactor);
    return Math.max(currentPrice, 0); // Ensure the current price is not negative
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
        // Retrieve the current highest asset ID
        const assetsRef = admin.database().ref('assets');
        const assetsSnapshot = await assetsRef.orderByKey().limitToLast(1).once('value');
        let newAssetId = 1;
        assetsSnapshot.forEach(childSnapshot => {
            const highestId = parseInt(childSnapshot.key, 10);
            newAssetId = highestId + 1;
        });

        let uploadedImageURL = null;
        if (req.file) {
            const fileExtension = path.extname(req.file.originalname);
            const fileName = `${newAssetId}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
            const destination = `asset/${fileName}`;
    
            console.log(`Uploading file to storage: ${filePath} to ${destination}`);
            uploadedImageURL = await uploadFileToStorage(filePath, destination);
            console.log(`Uploaded file URL: ${uploadedImageURL}`);
            fs.unlinkSync(filePath);
        }

        // Generate a QR code that encodes the URL of the uploaded image
        const qrCodeBase64 = await generateQRCode(uploadedImageURL);
        const qrCodeBuffer = Buffer.from(qrCodeBase64.split(',')[1], 'base64');

        // Ensure the directory exists
        const qrCodeDir = path.join(__dirname, '..', 'uploads', 'qrcodes');
        if (!fs.existsSync(qrCodeDir)) {
            fs.mkdirSync(qrCodeDir, { recursive: true });
        }

        // Save the QR code image to the local file system
        const qrCodeFileName = `${newAssetId}.png`;
        const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);
        fs.writeFileSync(qrCodeFilePath, qrCodeBuffer);

        // Upload the QR code image to Firebase Storage
        const qrCodeDestination = `qrcodes/${qrCodeFileName}`;
        console.log(`Uploading QR code to storage: ${qrCodeFilePath} to ${qrCodeDestination}`);
        const qrCodeURL = await uploadFileToStorage(qrCodeFilePath, qrCodeDestination);
        console.log(`Uploaded QR code URL: ${qrCodeURL}`);
        fs.unlinkSync(qrCodeFilePath);

        const newAsset = {
            name,
            description,
            originalPrice: originalPrice,
            depreciationRate: depreciationRate,
            depreciationValue: depreciationValue,
            purchaseDate: purchaseDate,
            currentPrice: calculateCurrentPrice(originalPrice, depreciationRate, depreciationValue, purchaseDate),
            imageURL: uploadedImageURL,
            trackerId,
            createdBy: req.user.uid,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            qrCode: qrCodeURL, // Store the URL of the QR code image
            editRequested: false,
            editRequestedBy: null,
            editRequestedAt: null,
            editApproved: false,
            editApprovedBy: null,
            editApprovedAt: null,
            proposedChanges: null // Store proposed changes
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
    const { tracker_id } = req.params;
    let updates = req.body;

    try {
        const snapshot = await admin.database().ref(`assets/${tracker_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();
        const isAdmin = req.user.role === 'admin';
        const isPIC = req.user.role === 'pic';

        // Check if user is allowed to update
        if (!isAdmin && !(isPIC && asset.editApproved)) {
            return res.status(403).json({ error: "You do not have permission to edit this asset" });
        }

        // Only allow one edit request at a time for PIC
        if (isPIC && !asset.editApproved) {
            return res.status(403).json({ error: "You need admin approval to edit this asset" });
        }

        let uploadedImageURL = null;
        if (req.file) {
            // If a new image is being uploaded, delete the old image
            if (asset.imageURL) {
                await deleteFileFromStorage(asset.imageURL);
            }
            if (asset.qrCode){
                await deleteFileFromStorage(asset.qrCode)
            }

            const fileExtension = path.extname(req.file.originalname);
            const fileName = `${asset_Id}${fileExtension}`;
            const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
            const destination = `asset/${fileName}`;

            console.log(`Uploading new file to storage: ${filePath} to ${destination}`);
            uploadedImageURL = await uploadFileToStorage(filePath, destination);
            console.log(`Uploaded new file URL: ${uploadedImageURL}`);
            fs.unlinkSync(filePath);
            
            // Include the new image URL in the updates
            updates.image = uploadedImageURL;
        }
        const qrCodeFileName = '${asset_id}.png';
        const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);

        const qrCodeDestination = `qrcodes/${qrCodeFileName}`;
        console.log(`Uploading QR code to storage: ${qrCodeFilePath} to ${qrCodeDestination}`);
        const qrCodeURL = await uploadFileToStorage(qrCodeFilePath, qrCodeDestination);
        console.log(`Uploaded QR code URL: ${qrCodeURL}`);
        fs.unlinkSync(qrCodeFilePath);

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;

        // Reset edit approval status after update
        if (asset.editApproved) {
            updates.editApproved = false;
            updates.editApprovedAt = null;
            updates.editApprovedBy = null;
        }

        // Ensure updates is a plain object
        updates = { ...updates };

        await admin.database().ref(`asset/${tracker_id}`).update(updates);
        res.json({ id: tracker_id, ...updates });
    } catch (error) {
        console.error("Error updating asset:", error);
        res.status(error.statusCode || 500).json({ error: error.message });
    }
};

const updateAsset = async (req, res) => {
    const { asset_id } = req.params;
    const updates = { ...req.body }; // Ensure updates is a plain object
    const image = req.file;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();
        const oldImageURL = asset.imageURL;
        const oldQRCodeURL = asset.qrCode;

        // Update image if a new image is provided
        if (image) {
            // Preserve the original file extension
            const extension = path.extname(image.originalname);
            const imageName = `${path.basename(image.filename, extension)}${extension}`;
            const imageURL = await uploadFileToStorage(image.path, `assets/${imageName}`);
            updates.imageURL = imageURL;

            if (oldImageURL) {
                await deleteFileFromStorage(oldImageURL);
            }
        }

        // Generate new QR code if the name is being updated
        if (updates.name && updates.name !== asset.name) {
            const qrCodeBase64 = await generateQRCode(updates.name);

            // Ensure the directory exists
            const qrCodeDir = path.join(__dirname, '..', 'uploads', 'qrcodes');
            if (!fs.existsSync(qrCodeDir)) {
                fs.mkdirSync(qrCodeDir, { recursive: true });
            }

            const qrCodeBuffer = Buffer.from(qrCodeBase64.split(',')[1], 'base64');
            const qrCodeFileName = `${updates.name}_${Date.now()}.png`;
            const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);
            fs.writeFileSync(qrCodeFilePath, qrCodeBuffer);
            const qrCodeURL = await uploadFileToStorage(qrCodeFilePath, `qrcodes/${qrCodeFileName}`);
            fs.unlinkSync(qrCodeFilePath);
            updates.qrCode = qrCodeURL;

            if (oldQRCodeURL) {
                await deleteFileFromStorage(oldQRCodeURL);
            }
        }

        // Update current price if original price, depreciation value, or purchase date is being updated
        const originalPrice = updates.originalPrice !== undefined ? updates.originalPrice : asset.originalPrice;
        const depreciationValue = updates.depreciationValue !== undefined ? updates.depreciationValue : asset.depreciationValue;
        const purchaseDate = updates.purchaseDate !== undefined ? updates.purchaseDate : asset.purchaseDate;

        // Validate depreciation value if provided
        if (updates.depreciationValue !== undefined && (typeof updates.depreciationValue !== 'number' || updates.depreciationValue < 0)) {
            throw new CustomError("Invalid depreciation value, must be a non-negative number", 400);
        }

        if (updates.originalPrice !== undefined || updates.depreciationValue !== undefined || updates.purchaseDate !== undefined) {
            const currentPrice = calculateCurrentPrice(originalPrice, asset.depreciationRate, depreciationValue, purchaseDate);
            updates.currentPrice = currentPrice;
        }

        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;

        // Reset edit approval status after update
        if (asset.editApproved) {
            updates.editApproved = false;
            updates.editApprovedAt = null;
            updates.editApprovedBy = null;
        }

        // Ensure updates is a plain object
        if (typeof updates !== 'object' || updates === null) {
            throw new CustomError("Invalid updates object", 400);
        }

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
        console.log(`Deleting asset with ID: ${asset_id}`);

        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const assetData = snapshot.val();
        const imageURL = assetData.imageURL;
        const qrCodeURL = assetData.qrCode;

        console.log(`Asset data:`, assetData);

        await admin.database().ref(`assets/${asset_id}`).remove();

        if (imageURL) {
            console.log(`Deleting image at URL: ${imageURL}`);
            await deleteFileFromStorage(imageURL);
        }
        if (qrCodeURL) {
            console.log(`Deleting QR code at URL: ${qrCodeURL}`);
            await deleteFileFromStorage(qrCodeURL);
        }

        res.json({ message: "Asset deleted successfully" });
    } catch (error) {
        console.error("Error deleting asset:", error);
        res.status(500).json({ error: "Error deleting asset" });
    }
};



const requestEdit = async (req, res) => {
    const { asset_id } = req.params;
    const proposedChanges = req.body;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        if (req.user.role.toLowerCase() !== 'pic') {
            return res.status(403).json({ error: "Only PIC can request edit access" });
        }

        await admin.database().ref(`assets/${asset_id}`).update({
            editRequested: true,
            editRequestedBy: req.user.uid,
            editRequestedAt: admin.database.ServerValue.TIMESTAMP,
            proposedChanges
        });

        res.json({ message: "Edit access requested successfully" });
    } catch (error) {
        console.error("Error requesting edit access:", error);
        res.status(500).json({ error: "Error requesting edit access" });
    }
};


const approveEdit = async (req, res) => {
    const { asset_id } = req.params;

    try {
        const snapshot = await admin.database().ref(`assets/${asset_id}`).once('value');
        if (!snapshot.exists()) {
            throw new CustomError("Asset not found", 404);
        }

        const asset = snapshot.val();

        if (req.user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ error: "Only admin can approve edit access" });
        }

        const proposedChanges = asset.proposedChanges || {};
        const updates = {
            ...proposedChanges,
            editApproved: true,
            editApprovedBy: req.user.uid,
            editApprovedAt: admin.database.ServerValue.TIMESTAMP,
            editRequested: false,
            editRequestedBy: null,
            editRequestedAt: null,
            proposedChanges: null // Clear the proposed changes after approval
        };

        await admin.database().ref(`assets/${asset_id}`).update(updates);

        res.json({ message: "Edit access approved successfully" });
    } catch (error) {
        console.error("Error approving edit access:", error);
        res.status(500).json({ error: "Error approving edit access" });
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
