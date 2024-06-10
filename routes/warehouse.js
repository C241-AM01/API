const express = require('express');
const router = express.Router();
const warehouseService = require('../services/warehouseService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole(['admin']), warehouseService.createWarehouse);
router.put('/assign-users/:warehouse_id', authenticateJWT, authorizeRole(['admin']), warehouseService.assignUsersToWarehouse);
router.get('/', authenticateJWT, authorizeRole(['user', 'admin', 'pic']), warehouseService.listWarehouses);
router.get('/assets/:warehouse_id', authenticateJWT, authorizeRole(['user', 'admin', 'pic']), warehouseService.listWarehouseAssets);

module.exports = router;
