const express = require('express');
const router = express.Router();
const { createMobileAsset, getMobileAsset, updateMobileAsset, deleteMobileAsset, queryMobileAssets } = require('../services/mobileAssetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole('PIC'), createMobileAsset);
router.get('/', authenticateJWT, authorizeRole('User'), queryMobileAssets);
router.get('/:assetId', authenticateJWT, getMobileAsset);
router.put('/:assetId', authenticateJWT, authorizeRole('Admin'), updateMobileAsset);
router.delete('/:assetId', authenticateJWT, authorizeRole('Admin'), deleteMobileAsset);

module.exports = router;
