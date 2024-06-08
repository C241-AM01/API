const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const SECRET_KEY = "your_jwt_secret_key";

const authenticateJWT = async (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
        console.log("No token found");
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        const decodedToken = jwt.verify(token, SECRET_KEY);
        console.log("JWT verified. Decoded token:", decodedToken);

        const user = await admin.auth().getUser(decodedToken.uid);
        if (!user) {
            console.log("User not found");
            return res.status(403).json({ error: "User not found" });
        }

        console.log("User authenticated:", user);
        req.user = {
            uid: user.uid,
            email: user.email,
            role: decodedToken.role  // Assuming role is part of the JWT payload
        };
        next();
    } catch (err) {
        console.log("Token verification failed:", err);
        return res.status(403).json({ error: "Token verification failed" });
    }
};

const authorizeRole = (roles) => {
    return (req, res, next) => {
        console.log("Authorizing role. User role:", req.user.role, "Allowed roles:", roles);
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "You do not have permission to access this resource" });
        }
        next();
    };
};

module.exports = { authenticateJWT, authorizeRole };
