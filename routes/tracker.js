const express = require('express');
const router = express.Router();
const trackerService = require('../services/trackerService');
const { authenticateJWT, authorizeRole } = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.post('/', authenticateJWT, authorizeRole(['Admin']), upload.single('image'), trackerService.createTracker);
router.get('/', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), trackerService.listTrackers);
router.get('/:tracker_id', authenticateJWT, authorizeRole(['User', 'Admin', 'PIC']), trackerService.getTracker);
router.put('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), upload.single('image'), trackerService.updateTracker);
router.delete('/:tracker_id', authenticateJWT, authorizeRole(['Admin']), trackerService.deleteTracker);
router.put('/request-edit/:tracker_id', authenticateJWT, authorizeRole(['PIC']), trackerService.requestEdit);
router.put('/approve-edit/:tracker_id', authenticateJWT, authorizeRole(['Admin']), trackerService.approveEdit);

module.exports = router;
