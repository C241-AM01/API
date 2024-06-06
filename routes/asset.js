const express = require('express');
const router = express.Router();
const assetService = require('../services/assetService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.post('/', authenticateJWT, authorizeRole(['admin']), upload.single('image'), assetService.addAsset);
router.get('/', authenticateJWT, authorizeRole(['user', 'Admin', 'PIC']), assetService.listAssets);
router.get('/:asset_id', authenticateJWT, authorizeRole(['user', 'admin', 'pic']), assetService.getAsset);
router.put('/:asset_id', authenticateJWT, authorizeRole(['admin']), upload.single('image'), assetService.updateAsset);
router.delete('/:asset_id', authenticateJWT, authorizeRole(['admin']), assetService.deleteAsset);
router.put('/request-edit/:asset_id', authenticateJWT, authorizeRole(['pic']), assetService.requestEdit);
router.put('/approve-edit/:asset_id', authenticateJWT, authorizeRole(['admin']), assetService.approveEdit);

module.exports = router;
