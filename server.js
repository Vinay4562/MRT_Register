const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

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
app.use(session({
    secret: 'chantichanti2255',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using https
        maxAge: 1000 * 60 * 5 // Session expires after 5 minutes of inactivity
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash()); // Add this line to use flash messages
app.use(require('connect-flash')());
app.use(cors({ origin: 'http://400kvssshankarpally.free.nf' })); // Replace with your frontend domain
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' folder

// Define schema and model
const feederSchema = new mongoose.Schema({
    feederName: { type: String, required: true },
    lastTestedDate: { type: Date, required: true },
    scheduledDate: { type: Date, required: true },
    status: { type: String, required: true },
    remarks: { type: String }
});

const Feeder = mongoose.model('Feeder', feederSchema);

// Mock user data (replace with database logic)
const users = [
    { id: 1, username: 'Shankarpally400kv', password: 'Shankarpally@9870' }
];

// Passport local strategy
passport.use(new LocalStrategy(
    (username, password, done) => {
        const user = users.find(u => u.username === username && u.password === password);
        if (!user) {
            return done(null, false, { message: 'Incorrect username or password.' });
        }
        return done(null, user);
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    const user = users.find(u => u.id === id);
    done(null, user);
});

// Cache Control to prevent accessing pages after logout
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/LCbox.html',
    failureRedirect: '/',
    failureFlash: true
}));

// Ensure the user is authenticated for LCbox.html access
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}

app.get('/LCbox.html', isAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/public/LCbox.html.html');
});

// Logout route
app.post('/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err); // Pass errors to the error handling middleware
      }
      req.session.destroy((err) => {
        if (err) {
          return next(err); // Pass errors to the error handling middleware
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.redirect('/'); // Redirect to login page
      });
    });
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
    const { feederName, lastTestedDate, scheduledDate, status, remarks } = req.body;

    if (!feederName || !lastTestedDate || !scheduledDate || !status || !remarks ) {
        return res.status(400).json({ message: 'Validation failed: Missing required fields' });
    }

    try {
        const feeder = new Feeder(req.body);
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
