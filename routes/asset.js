const express = require('express');
const router = express.Router();
const assetService = require('../services/assetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.post('/', authenticateJWT, authorizeRole(['Admin']), upload.single('image'), assetService.addAsset);
router.get('/', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), assetService.listAssets);
router.get('/:asset_id', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), assetService.getAsset);
router.put('/:asset_id', authenticateJWT, authorizeRole(['Admin']), upload.single('image'), assetService.updateAsset);
router.delete('/:asset_id', authenticateJWT, authorizeRole(['Admin']), assetService.deleteAsset);
router.put('/request-edit/:asset_id', authenticateJWT, authorizeRole(['PIC']), assetService.requestEdit);
router.put('/approve-edit/:asset_id', authenticateJWT, authorizeRole(['Admin']), assetService.approveEdit);

module.exports = router;
