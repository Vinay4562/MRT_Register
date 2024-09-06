const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

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
app.use(cors({ origin: 'http://400kvssshankarpally.free.nf' })); // Replace with your frontend domain
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' folder

// Session Middleware
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 } // session will expire in 60 seconds (for testing)
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
const defaultPassword = 'Shankarpally@9870'; // Use bcrypt to hash the password

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

    if (username === defaultUsername && bcrypt.compareSync(password, hashedPassword)) {
        req.session.loggedIn = true;
        req.session.username = username;
        return res.redirect('/LCbox.html');
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

// Routes
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
    res.status(500).send('Something went wrong!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
