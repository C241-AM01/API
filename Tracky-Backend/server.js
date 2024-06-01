const express = require('express');
const bodyParser = require('body-parser');
const { initializeFirebase } = require('./config/firebaseConfig');
const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/asset');
const mobileAssetRoutes = require('./routes/mobileAsset');

const app = express();
initializeFirebase();

app.use(bodyParser.json());
app.use('/auth', authRoutes);
app.use('/asset', assetRoutes);
app.use('/mobile-assets', mobileAssetRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
