const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs'); // Using bcryptjs for password hashing
const cors = require('cors');
const path = require('path');
const helmet = require('helmet'); // For added security
require('dotenv').config(); // Load environment variables

const app = express();
const port = process.env.PORT || 3500;
const mongoUri = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(helmet()); // Use Helmet to set various HTTP headers for security
app.use(cors({
    origin: ['http://400kvssshankarpally.free.nf', 'http://localhost:3000'], // Allow multiple origins
    credentials: true // Allow cookies to be sent with CORS requests
}));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public' folder

// Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'mysecretkey', // Use environment variable for session secret
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000, secure: process.env.NODE_ENV === 'production' } // Secure cookies in production
}));

// Define schema and model
const feederSchema = new mongoose.Schema({
    feederName: { type: String, required: true },
    lastTestedDate: { type: Date, required: true },
    scheduledDate: { type: Date, required: true },
    status: { type: String, required: true },
    remarks: { type: String }
});

const Feeder = mongoose.model('Feeder', feederSchema);

// Default credentials (for testing)
const defaultUsername = 'Shankarpally400kv';
const defaultPassword = 'Shankarpally@9870'; // Unhashed default password

// Middleware to check authentication
const ensureAuthenticated = (req, res, next) => {
    if (req.session.loggedIn) {
        return next();
    }
    res.redirect('/login');
};

// Route to render login page
app.get('/login', (req, res) => {
    if (req.session.loggedIn) {
        res.redirect('/LCbox.html'); // Redirect if already logged in
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

// Route to handle login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Hash the default password inside the login route
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Check username and compare hashed password
    if (username === defaultUsername && await bcrypt.compare(password, hashedPassword)) {
        req.session.loggedIn = true;
        req.session.username = username;
        return res.redirect('/LCbox.html'); // Redirect to LCbox.html upon successful login
    }

    res.status(401).send('Invalid credentials. <a href="/login">Try again</a>');
});

// Route to handle logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
    });
});

// Protected route for LCbox.html
app.get('/LCbox.html', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'LCbox.html'));
});

// Routes to handle CRUD for Feeders
app.get('/feeders', async (req, res) => {
    try {
        const feeders = await Feeder.find();
        res.json(feeders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/feeders', async (req, res) => {
    const feeder = new Feeder(req.body);
    try {
        await feeder.save();
        res.status(201).json(feeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put('/feeders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const updatedFeeder = await Feeder.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!updatedFeeder) {
            return res.status(404).json({ message: 'Feeder not found' });
        }
        res.json(updatedFeeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/feeders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const feeder = await Feeder.findByIdAndDelete(id);
        if (!feeder) {
            return res.status(404).json({ message: 'Feeder not found' });
        }
        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// General error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (process.env.NODE_ENV === 'development') {
        res.status(500).send(`Error: ${err.message}`);
    } else {
        res.status(500).send('Something went wrong! Please try again later.');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
