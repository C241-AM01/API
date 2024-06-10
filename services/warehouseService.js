const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const createWarehouse = async (req, res) => {
    const { name, description, adminId, picIds, userIds } = req.body;

    try {
        // Reference to the warehouses node in the database
        const warehouseRef = admin.database().ref('warehouses');
        
        // Get the last warehouse ID to generate a new sequential ID
        const warehouseSnapshot = await warehouseRef.orderByKey().limitToLast(1).once('value');
        let newWarehouseId = 1;
        warehouseSnapshot.forEach(childSnapshot => {
            const highestId = parseInt(childSnapshot.key, 10);
            newWarehouseId = highestId + 1;
        });

        // Define the new warehouse object
        const newWarehouse = {
            name,
            description,
            admins: adminId ? [adminId] : [],
            pics: picIds || [],
            users: userIds || [],
            assets: [],
            createdAt: admin.database.ServerValue.TIMESTAMP,
            createdBy: req.user.uid
        };

        // Reference to the new warehouse
        const newWarehouseRef = admin.database().ref(`warehouses/${newWarehouseId}`);
        await newWarehouseRef.set(newWarehouse);

        // Respond with success message and new warehouse ID
        res.json({ message: "Warehouse created successfully", id: newWarehouseId });
    } catch (error) {
        console.error("Error creating warehouse:", error);
        res.status(500).json({ error: "Error creating warehouse" });
    }
};

const assignUsersToWarehouse = async (req, res) => {
    const { warehouse_id } = req.params;
    const { adminId, picIds, userIds } = req.body;

    try {
        const warehouseRef = admin.database().ref(`warehouses/${warehouse_id}`);
        const warehouseSnapshot = await warehouseRef.once('value');
        if (!warehouseSnapshot.exists()) {
            return res.status(404).json({ error: "Warehouse not found" });
        }

        const updates = {};
        if (adminId) {
            updates[`/admins/${warehouseSnapshot.child('admins').numChildren()}`] = adminId;
        }
        if (picIds) {
            for (const picId of picIds) {
                updates[`/pics/${warehouseSnapshot.child('pics').numChildren()}`] = picId;
            }
        }
        if (userIds) {
            for (const userId of userIds) {
                updates[`/users/${warehouseSnapshot.child('users').numChildren()}`] = userId;
            }
        }

        await warehouseRef.update(updates);

        res.json({ message: "Users assigned to warehouse successfully" });
    } catch (error) {
        console.error("Error assigning users to warehouse:", error);
        res.status(500).json({ error: "Error assigning users to warehouse" });
    }
};

const listWarehouseAssets = async (req, res) => {
    const { warehouse_id } = req.params;

    try {
        const warehouseRef = admin.database().ref(`warehouses/${warehouse_id}`);
        const warehouseSnapshot = await warehouseRef.once('value');
        if (!warehouseSnapshot.exists()) {
            return res.status(404).json({ error: "Warehouse not found" });
        }

        const warehouse = warehouseSnapshot.val();
        const assetPromises = warehouse.assets.map(async (assetId) => {
            const assetRef = admin.database().ref(`assets/${assetId}`);
            const assetSnapshot = await assetRef.once('value');
            if (assetSnapshot.exists()) {
                const asset = assetSnapshot.val();
                const trackerRef = admin.database().ref(`tracker/${asset.trackerId}`);
                const trackerSnapshot = await trackerRef.once('value');
                const tracker = trackerSnapshot.exists() ? trackerSnapshot.val() : null;
                return { ...asset, tracker };
            }
            return null;
        });

        const assets = (await Promise.all(assetPromises)).filter(asset => asset !== null);

        res.json(assets);
    } catch (error) {
        console.error("Error listing warehouse assets:", error);
        res.status(500).json({ error: "Error listing warehouse assets" });
    }
};

const listWarehouses = async (req, res) => {
    try {
        const snapshot = await admin.database().ref('warehouses').once('value');
        if (!snapshot.exists()) {
            console.log("No warehouses found");
            return res.json([]);
        }
        const warehouses = snapshot.val();

        // Convert the warehouses object to an array with the ID and filter out null or undefined entries
        const warehousesArray = Object.entries(warehouses)
            .filter(([_, warehouse]) => warehouse !== null)
            .map(([id, warehouse]) => ({ id, ...warehouse }));

        console.log("Filtered Warehouses data:", warehousesArray);
        res.json(warehousesArray);
    } catch (error) {
        console.error("Error listing warehouses:", error);
        res.status(500).json({ error: "Error listing warehouses" });
    }
};



module.exports = {
    createWarehouse,
    assignUsersToWarehouse,
    listWarehouses,
    listWarehouseAssets
};
