const express = require('express');
const bodyParser = require('body-parser');
const { initializeFirebase } = require('./config/firebaseConfig');
const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/asset');
const trackerRoutes = require('./routes/tracker');

const app = express();
initializeFirebase();

app.use(bodyParser.json());
app.use('/auth', authRoutes);
app.use('/asset', assetRoutes);
app.use('/tracker', trackerRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
