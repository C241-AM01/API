const express = require('express');
const router = express.Router();
const mobileAssetService = require('../services/mobileAssetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');

router.post('/', authenticateJWT, authorizeRole(['Admin']), mobileAssetService.createMobileAsset);
router.get('/', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), mobileAssetService.queryMobileAssets);
router.get('/:tracker_id', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), mobileAssetService.getMobileAsset);
router.put('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), mobileAssetService.updateMobileAsset);
router.delete('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), mobileAssetService.deleteMobileAsset);
router.put('/request-approval/:tracker_id', authenticateJWT, authorizeRole(['PIC']), mobileAssetService.requestApproval);
router.put('/approve/:tracker_id', authenticateJWT, authorizeRole(['Admin']), mobileAssetService.approveMobileAsset);

module.exports = router;
