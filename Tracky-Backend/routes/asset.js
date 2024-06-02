const express = require('express');
const router = express.Router();
const assetService = require('../services/assetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole(['Admin']), assetService.addAsset);
router.get('/', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), assetService.listAssets);
router.get('/:tracker_id', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), assetService.getAsset);
router.put('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), assetService.updateAsset);
router.delete('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), assetService.deleteAsset);
router.put('/request-approval/:tracker_id', authenticateJWT, authorizeRole(['PIC']), assetService.requestApproval);
router.put('/approve/:tracker_id', authenticateJWT, authorizeRole(['Admin']), assetService.approveAsset);

module.exports = router;
