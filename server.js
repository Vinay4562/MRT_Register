const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
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
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
    origin: ['http://400kvssshankarpally.free.nf', 'https://mrt-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'],
    credentials: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'mysecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60, httpOnly: true, secure: false }
}));

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());

const defaultUsername = process.env.DEFAULT_USERNAME;
const hashedPassword = bcrypt.hashSync(process.env.DEFAULT_PASSWORD, 10);

passport.use(new LocalStrategy((username, password, done) => {
    if (username === defaultUsername && bcrypt.compareSync(password, hashedPassword)) {
        return done(null, { username });
    }
    return done(null, false, { message: 'Invalid credentials' });
}));

passport.serializeUser((user, done) => done(null, user.username));
passport.deserializeUser((username, done) => done(null, { username }));

// Authentication Routes
app.get('/api/check-auth', (req, res) => {
    res.status(req.session.loggedIn ? 200 : 401).json({ authenticated: !!req.session.loggedIn });
});

app.get('/login', (req, res) => {
    req.session.loggedIn ? res.redirect('/MRTregister.html') : res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === defaultUsername && bcrypt.compareSync(password, hashedPassword)) {
        req.session.loggedIn = true;
        req.session.username = username;
        return res.redirect('/MRTregister.html');
    }
    res.status(401).send('Invalid credentials. <a href="/login">Try again</a>');
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out successfully' });
    });
});

app.get('/MRTregister.html', (req, res) => {
    req.session.loggedIn ? res.sendFile(path.join(__dirname, 'public', 'MRTregister.html')) : res.redirect('/login');
});

// Define Feeder Schema & Model
const feederSchema = new mongoose.Schema({
    feederName: { type: String, required: true },
    lastTestedDate: { type: Date, required: true },
    scheduledDate: { type: Date, required: true },
    status: { type: String, required: true },
    remarks: { type: String }
});
const Feeder = mongoose.model('Feeder', feederSchema);

// CRUD Routes for Feeders
app.get('/feeders', async (req, res) => {
    try {
        res.json(await Feeder.find());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/feeders', async (req, res) => {
    try {
        const feeder = new Feeder(req.body);
        await feeder.save();
        res.status(201).json(feeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put('/feeders/:id', async (req, res) => {
    try {
        const updatedFeeder = await Feeder.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        updatedFeeder ? res.json(updatedFeeder) : res.status(404).json({ message: 'Feeder not found' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/feeders/:id', async (req, res) => {
    try {
        const feeder = await Feeder.findByIdAndDelete(req.params.id);
        feeder ? res.sendStatus(204) : res.status(404).json({ message: 'Feeder not found' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Nodemailer Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendEmail(feederName, scheduledDate) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.NOTIFY_EMAIL,
        subject: `MRT Testing Reminder - ${feederName}`,
        text: `Reminder: MRT Testing for ${feederName} is scheduled on ${scheduledDate}. Please ensure necessary preparations.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully for ${feederName}`);
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

cron.schedule('0 7 * * *', async () => {  // Runs at 07:00 AM UTC daily
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);  // Convert to UTC midnight

    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);  // Ensure full day range

    console.log("Checking for scheduled tests on:", today.toISOString());

    const feeders = await Feeder.find({
        scheduledDate: { $gte: startOfDay, $lte: endOfDay }  // Matches all times within the day
    });

    console.log(`Found ${feeders.length} feeders scheduled for today.`);

    feeders.forEach(feeder => {
        console.log("Sending email for:", feeder.feederName);
        sendEmail(feeder.feederName, feeder.scheduledDate);
    });
});

console.log("🚀 Email Reminder Scheduler set for 07:00 AM UTC...");

// Twilio SMS Reminder
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSMS(feederName, scheduledDate) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.error("Twilio credentials are missing! Check your .env file.");
        return;
    }
    
    try {
        const message = await twilioClient.messages.create({
            body: `Reminder: Next Testing Date for ${feederName} is on ${scheduledDate}. Please be prepared.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: process.env.ADMIN_PHONE_NUMBER
        });
        console.log(`✅ SMS sent successfully for ${feederName}. SID: ${message.sid}`);
    } catch (error) {
        console.error("❌ Error sending SMS:", error);
    }
}

cron.schedule('30 1 * * *', async () => {  // Runs at 01:30 AM UTC (07:00 AM IST)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1); // Move to next day

    console.log("🔍 Cron job running. Querying for scheduledDate:", today.toISOString());

    const feeders = await Feeder.find({
        scheduledDate: { $gte: today, $lt: tomorrow }  // Match entire UTC day
    });

    console.log(`📢 Found ${feeders.length} feeders scheduled for today.`);

    feeders.forEach(feeder => {
        console.log("📨 Sending SMS for:", feeder.feederName);
        sendSMS(feeder.feederName, feeder.scheduledDate);
    });
});

console.log("🚀 SMS Reminder Scheduler is Running at 01:30 AM UTC (07:00 AM IST)...");

// Manual Test Route
app.get('/test-sms', async (req, res) => {
    const feeder = await Feeder.findOne();  // Fetch any feeder
    if (!feeder) return res.status(404).send("No scheduled feeders found.");

    await sendSMS(feeder.feederName, feeder.scheduledDate);
    res.send("✅ SMS test triggered successfully!");
});

app.get('/check-env', (req, res) => {
    res.json({
        ADMIN_PHONE_NUMBER: process.env.ADMIN_PHONE_NUMBER,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
    });
});

// Add this route to server.js to check server time
app.get('/server-time', (req, res) => {
    res.send(`Server time: ${new Date().toString()}`);
});

// General error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));