const express = require('express');
const router = express.Router();
const assetService = require('../services/assetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole('PIC'), assetService.addAsset);
router.get('/', authenticateJWT, authorizeRole('User'), assetService.listAssets);
router.get('/:assetId', authenticateJWT, assetService.getAsset);
router.put('/:assetId', authenticateJWT, authorizeRole('Admin'), assetService.updateAsset);
router.delete('/:assetId', authenticateJWT, authorizeRole('Admin'), assetService.deleteAsset);
router.put('/approve/:assetId', authenticateJWT, authorizeRole('Admin'), assetService.approveAsset);

module.exports = router;
