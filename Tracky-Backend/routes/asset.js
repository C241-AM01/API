const express = require('express');
const router = express.Router();
const assetService = require('../services/assetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole(['Admin']), assetService.addAsset);
router.get('/', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), assetService.listAssets); // Ensure roles match
router.get('/:tracker_id', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), assetService.getAsset);
router.put('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), assetService.updateAsset);
router.delete('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), assetService.deleteAsset);
router.put('/request-edit/:tracker_id', authenticateJWT, authorizeRole(['PIC']), assetService.requestEdit);
router.put('/approve-edit/:tracker_id', authenticateJWT, authorizeRole(['Admin']), assetService.approveEdit);

module.exports = router;
